import { randomUUID } from "node:crypto";
import { Client, Room, ServerError } from "colyseus";
import {
  ALL_MAPS,
  GravitySimulation,
  SIM_CONFIG,
  getMapById,
  isClientMessage,
  type GravityMatchResult,
  type GravitySwitchInput,
} from "@jinshi-gravity/shared";
import { GravityRoomState, LeaderboardEntry, PlayerState } from "../state.js";
import { computeMatchResult } from "../winner.js";
import { syncState } from "../sim-sync.js";
import { generateRoomCode, pickColor } from "../util.js";

export interface GravityRoomOptions {
  mode?: "multiplayer" | "practice";
  code?: string;
  mapId?: string;
  playerId?: string;
  displayName?: string;
  /** Spectator flag set by client only for late joins during RUNNING. */
  spectator?: boolean;
}

interface DisconnectGrace {
  expireAt: number;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * The single Colyseus room for Jinshi Gravity. Owns the authoritative
 * GravitySimulation, every player seat, all phase transitions, input
 * validation, the broadcast clock, reconnection grace, and rematch tally.
 */
export class GravityRoom extends Room<{ state: GravityRoomState }> {
  state = new GravityRoomState();
  maxClients = 8;

  /** Authoritative simulation; instantiated on round start. */
  private sim: GravitySimulation | null = null;
  /** Stable playerId (from localStorage on the client) -> Colyseus sessionId. */
  private readonly sessionByPlayerId = new Map<string, string>();
  /** Colyseus sessionId -> stable playerId. */
  private readonly playerIdBySession = new Map<string, string>();
  /** Per-player reconnection grace. */
  private readonly grace = new Map<string, DisconnectGrace>();
  /** Set of playerIds currently spectating (late joiners / dead). */
  private readonly spectators = new Set<string>();
  private simInterval: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAtIso = "";
  private matchResult: GravityMatchResult | null = null;
  private resultSubmitted = false;
  private gameId = "";

  onCreate(options: GravityRoomOptions): void {
    const mode = options.mode === "practice" ? "practice" : "multiplayer";
    const code = options.code && options.code.length > 0 ? options.code : generateRoomCode();
    const mapId = options.mapId && getMapById(options.mapId) ? options.mapId : "training-run";

    this.state.mode = mode;
    this.state.code = code;
    this.state.mapId = mapId;
    this.state.phase = "LOBBY";
    this.maxClients = mode === "practice" ? 1 : SIM_CONFIG.maxPlayers;

    this.setMetadata({ code, mode, mapId });
    // Patch rate = state broadcast rate. SIM_CONFIG.broadcastRate = 20 Hz.
    this.setPatchRate(1000 / SIM_CONFIG.broadcastRate);
    // Simulation runs on its own clock; we drive it explicitly in this.tick loop.

    // Register message handlers.
    this.onMessage("set-name", (client, payload: unknown) =>
      this.handleSetName(client, payload),
    );
    this.onMessage("set-ready", (client, payload: unknown) =>
      this.handleSetReady(client, payload),
    );
    this.onMessage("select-map", (client, payload: unknown) =>
      this.handleSelectMap(client, payload),
    );
    this.onMessage("start-round", (client) => this.handleStartRound(client));
    this.onMessage("request-practice", (client) => this.handleStartPractice(client));
    this.onMessage("gravity-switch", (client, payload: unknown) =>
      this.handleGravitySwitch(client, payload),
    );
    this.onMessage("vote-rematch", (client, payload: unknown) =>
      this.handleVoteRematch(client, payload),
    );
  }

  onJoin(client: Client, options: GravityRoomOptions): void {
    if (!isString(options.playerId) || options.playerId.length === 0) {
      throw new ServerError(400, "Missing playerId");
    }
    const playerId = options.playerId;
    const displayName = sanitizeName(options.displayName);

    // Reconnection path: an existing seat is reserved for this playerId.
    const existing = this.state.players.get(playerId);
    if (existing) {
      // Drop the stale session id mapping before installing the new one,
      // so the old socket can no longer be resolved to this live seat via
      // seatFor() (prevents two sockets from contending one seat).
      const previousSessionId = this.sessionByPlayerId.get(playerId);
      if (previousSessionId && previousSessionId !== client.sessionId) {
        this.playerIdBySession.delete(previousSessionId);
      }
      existing.connected = true;
      existing.sessionId = client.sessionId;
      this.sessionByPlayerId.set(playerId, client.sessionId);
      this.playerIdBySession.set(client.sessionId, playerId);
      // Cancel grace timer.
      const g = this.grace.get(playerId);
      if (g?.timer) clearTimeout(g.timer);
      this.grace.delete(playerId);
      if (this.sim) {
        const p = this.sim.getPlayer(playerId);
        if (p) p.connected = true;
      }
      return;
    }

    // Seat capacity check for multiplayer.
    if (this.state.mode === "multiplayer" && this.seatedPlayers().length >= SIM_CONFIG.maxPlayers) {
      throw new ServerError(403, "Room is full");
    }

    // Determine seat vs spectator.
    const joinDuringRunning =
      this.state.phase === "COUNTDOWN" || this.state.phase === "RUNNING";

    const wire = new PlayerState();
    wire.playerId = playerId;
    wire.sessionId = client.sessionId;
    wire.displayName = displayName;
    wire.color = pickColor(this.usedColors());
    wire.connected = true;

    if (joinDuringRunning) {
      wire.spectator = true;
      wire.alive = false;
      this.spectators.add(playerId);
    } else {
      // Lobby or finished state: real seat.
      const seated = this.seatedPlayers();
      const isFirst = seated.length === 0;
      wire.isHost = isFirst;
      if (isFirst) this.state.hostId = playerId;
      if (this.state.mode === "practice") wire.ready = true;
    }

    this.state.players.set(playerId, wire);
    this.sessionByPlayerId.set(playerId, client.sessionId);
    this.playerIdBySession.set(client.sessionId, playerId);

    // In a practice room, immediately start the solo race on join.
    if (this.state.mode === "practice" && this.state.phase === "LOBBY") {
      this.beginCountdown();
    }
  }

  async onDrop(client: Client): Promise<void> {
    const playerId = this.playerIdBySession.get(client.sessionId);
    if (!playerId) return;
    const seat = this.state.players.get(playerId);
    if (seat) seat.connected = false;
    if (this.sim) {
      const simPlayer = this.sim.getPlayer(playerId);
      if (simPlayer) simPlayer.connected = false;
    }

    // Spectators leave silently. Practice rooms also just clear.
    if (this.spectators.has(playerId) || this.state.mode === "practice") {
      this.removePlayer(playerId);
      // If practice host left, end the room by disconnecting everyone (it's a 1-seat room).
      if (this.state.players.size === 0) this.disconnect();
      return;
    }

    // Active seat: reserve during grace period (LOBBY both uses 5s; RUNNING 15s).
    const graceMs = this.state.phase === "RUNNING" || this.state.phase === "COUNTDOWN"
      ? SIM_CONFIG.reconnectGraceMs
      : 5_000;

    const g: DisconnectGrace = { expireAt: Date.now() + graceMs };
    g.timer = setTimeout(() => {
      this.handleGraceExpired(playerId);
    }, graceMs + 50);
    this.grace.set(playerId, g);

    // Permit Colyseus' own reconnection if the same websocket returns.
    try {
      await this.allowReconnection(client, graceMs + 500);
      // Resolved via onReconnect path; nothing more to do here.
    } catch {
      // Colyseus gave up; the grace timer above handles elimination.
    }
  }

  onReconnect(client: Client): void {
    const playerId = this.playerIdBySession.get(client.sessionId);
    if (!playerId) return;
    const seat = this.state.players.get(playerId);
    if (seat) {
      seat.connected = true;
      seat.sessionId = client.sessionId;
    }
    if (this.sim) {
      const p = this.sim.getPlayer(playerId);
      if (p) p.connected = true;
    }
    const g = this.grace.get(playerId);
    if (g?.timer) clearTimeout(g.timer);
    this.grace.delete(playerId);
  }

  onLeave(client: Client): void {
    const playerId = this.playerIdBySession.get(client.sessionId);
    if (!playerId) return;
    this.playerIdBySession.delete(client.sessionId);
    this.sessionByPlayerId.delete(playerId);
    // If a spectator or room is no longer running, remove them entirely.
    if (this.spectators.has(playerId) || this.state.phase === "LOBBY" || this.state.phase === "FINISHED") {
      this.removePlayer(playerId);
    }
  }

  onDispose(): void {
    if (this.simInterval) clearInterval(this.simInterval);
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    for (const g of this.grace.values()) if (g.timer) clearTimeout(g.timer);
  }

  // ---------- Phase transitions ----------

  private beginCountdown(): void {
    if (this.state.phase !== "LOBBY") return;
    this.state.phase = "COUNTDOWN";
    this.state.countdownEndsAt = Date.now() + SIM_CONFIG.countdownMs;

    let remaining = SIM_CONFIG.countdownMs;
    this.broadcast("countdown", { remainingMs: remaining });
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      remaining -= 1000;
      this.broadcast("countdown", { remainingMs: Math.max(0, remaining) });
    }, 1000);

    setTimeout(() => {
      if (this.countdownTimer) clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      this.beginRunning();
    }, SIM_CONFIG.countdownMs + 30);
  }

  private beginRunning(): void {
    const map = getMapById(this.state.mapId) ?? ALL_MAPS[0];
    if (!map) throw new ServerError(500, "No map configured");
    this.sim = new GravitySimulation(map);
    this.gameId = `${this.roomId}-${randomUUID()}`;
    for (const wire of this.state.players.values()) {
      if (this.spectators.has(wire.playerId)) continue;
      this.sim.addPlayer(wire.playerId, wire.displayName, wire.color);
    }
    this.sim.startRound();
    this.startedAtIso = new Date().toISOString();
    this.state.phase = "RUNNING";
    this.state.roundStartedAt = Date.now();
    this.broadcast("round-started", { mapId: this.state.mapId, startedAt: this.startedAtIso });
    this.ensureSimLoop();
  }

  private endRound(): void {
    if (this.state.phase === "FINISHED" || !this.sim) return;
    this.state.phase = "FINISHED";
    this.state.roundEndedAt = Date.now();
    if (this.simInterval) clearInterval(this.simInterval);
    this.simInterval = null;

    const result = computeMatchResult(this.sim.players.values(), {
      gameId: this.gameId,
      roomId: this.roomId,
      mapId: this.state.mapId,
      startedAt: this.startedAtIso,
      endedAt: new Date().toISOString(),
    });
    this.matchResult = result;
    this.resultSubmitted = false; // built but NOT sent anywhere (per scope)

    this.state.resultReason = result.reason;
    this.state.winnerId = result.winnerId ?? "";
    // Push placement snapshots into leaderboard array.
    this.state.leaderboard.clear();
    for (const p of result.placements) {
      const entry = new LeaderboardEntry();
      entry.playerId = p.playerId;
      entry.displayName = p.displayName;
      entry.placement = p.placement;
      entry.finished = p.finished;
      entry.eliminated = p.eliminated;
      entry.progress = p.progress;
      entry.survivalMs = p.survivalMs;
      this.state.leaderboard.push(entry);
      const seat = this.state.players.get(p.playerId);
      if (seat) seat.placement = p.placement;
    }
    // Reset rematch voter list. Required = number of seated (non-spectator) players.
    this.state.rematchVoters.clear();
    this.state.rematchRequired = Math.max(1, this.seatedPlayers().length);
    this.broadcast("round-ended", { result });
  }

  // ---------- Per-tick simulation ----------

  private ensureSimLoop(): void {
    if (this.simInterval) return;
    const tickMs = SIM_CONFIG.tickDtMs;
    this.simInterval = setInterval(() => this.tickSimOnce(), tickMs);
  }

  private tickSimOnce(): void {
    if (!this.sim || this.state.phase !== "RUNNING") {
      if (this.simInterval) clearInterval(this.simInterval);
      this.simInterval = null;
      return;
    }
    const events = this.sim.tick();
    this.state.simTimeMs = this.sim.simTimeMs;

    for (const d of events.deaths) {
      this.broadcast("eliminated", { playerId: d.playerId, cause: d.cause });
    }
    for (const f of events.finishes) {
      this.broadcast("finished", {
        playerId: f.playerId,
        placement: this.livePlacement(f.playerId),
      });
    }

    // Sync projection of simulation state -> schema for replication.
    syncState(this.sim, this.state.players);

    // End the round if everyone is done or a lone survivor remains.
    const activeRacers = this.sim.activeRacerCount();
    const finishedCount = [...this.sim.players.values()].filter((p) => p.finished).length;
    const totalSeated = this.sim.players.size;
    if (activeRacers === 0) {
      this.endRound();
    } else if (
      this.state.mode === "multiplayer" &&
      activeRacers === 1 &&
      finishedCount === 0 &&
      totalSeated > 1
    ) {
      this.endRound();
    }
  }

  private livePlacement(playerId: string): number {
    if (!this.sim) return 0;
    const all = [...this.sim.players.values()];
    all.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.alive && !b.alive) return -1;
      if (!a.alive && b.alive) return 1;
      return b.progress - a.progress;
    });
    return all.findIndex((p) => p.playerId === playerId) + 1;
  }

  // ---------- Message handlers ----------

  private handleSetName(client: Client, payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const name = (payload as { name?: unknown }).name;
    if (!isString(name)) return;
    const seat = this.seatFor(client);
    if (seat) seat.displayName = sanitizeName(name);
    if (this.sim) {
      const p = this.sim.getPlayer(seat?.playerId ?? "");
      if (p) p.displayName = sanitizeName(name);
    }
  }

  private handleSetReady(client: Client, payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const ready = (payload as { ready?: unknown }).ready;
    if (typeof ready !== "boolean") return;
    if (this.state.phase !== "LOBBY") return;
    const seat = this.seatFor(client);
    if (!seat || seat.spectator) return;
    seat.ready = ready;
  }

  private handleSelectMap(client: Client, payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const mapId = (payload as { mapId?: unknown }).mapId;
    if (!isString(mapId) || !getMapById(mapId)) {
      client.send("error", { code: "bad-map", message: "Unknown map" });
      return;
    }
    if (this.state.phase !== "LOBBY") return;
    const seat = this.seatFor(client);
    if (!seat || !seat.isHost) {
      client.send("error", { code: "not-host", message: "Only the host can pick the map" });
      return;
    }
    this.state.mapId = mapId;
    this.setMetadata({ code: this.state.code, mode: this.state.mode, mapId });
  }

  private handleStartRound(client: Client): void {
    if (this.state.mode !== "multiplayer") return;
    if (this.state.phase !== "LOBBY") return;
    const seat = this.seatFor(client);
    if (!seat || !seat.isHost) {
      client.send("error", { code: "not-host", message: "Only the host can start" });
      return;
    }
    const seated = this.seatedPlayers();
    if (seated.length < SIM_CONFIG.minPlayers) {
      client.send("error", { code: "too-few", message: `Need at least ${SIM_CONFIG.minPlayers} players` });
      return;
    }
    const readyCount = seated.filter((p) => p.ready).length;
    if (readyCount < SIM_CONFIG.minPlayers) {
      client.send("error", { code: "not-ready", message: "Not enough players are ready" });
      return;
    }
    this.beginCountdown();
  }

  private handleStartPractice(client: Client): void {
    if (this.state.mode !== "practice") return;
    if (this.state.phase !== "LOBBY") return;
    const seat = this.seatFor(client);
    if (!seat) return;
    this.beginCountdown();
  }

  private handleGravitySwitch(client: Client, payload: unknown): void {
    if (this.state.phase !== "RUNNING") return;
    if (!isClientMessage({ type: "gravity-switch", ...(payload as object) })) return;
    const typed = payload as GravitySwitchInput;
    const seat = this.seatFor(client);
    if (!seat || seat.spectator) return;
    if (!this.sim) return;
    const result = this.sim.applyInput(seat.playerId, typed);
    if (!result.ok) {
      client.send("error", { code: result.reason, message: `Input rejected: ${result.reason}` });
    }
  }

  private handleVoteRematch(client: Client, payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const rematch = (payload as { rematch?: unknown }).rematch;
    if (typeof rematch !== "boolean") return;
    if (this.state.phase !== "FINISHED") return;
    const seat = this.seatFor(client);
    if (!seat || seat.spectator) return;
    if (!rematch) {
      // Withdraw vote.
      const idx = this.state.rematchVoters.indexOf(seat.playerId);
      if (idx >= 0) this.state.rematchVoters.splice(idx, 1);
      return;
    }
    if (!this.state.rematchVoters.includes(seat.playerId)) {
      this.state.rematchVoters.push(seat.playerId);
    }
    if (this.state.rematchVoters.length >= this.state.rematchRequired) {
      this.startRematch();
    }
  }

  private startRematch(): void {
    // Reset round state, keep players + host, back to LOBBY for level selection.
    if (this.simInterval) clearInterval(this.simInterval);
    this.simInterval = null;
    this.sim = null;
    this.spectators.clear();
    this.state.leaderboard.clear();
    this.state.rematchVoters.clear();
    this.state.resultReason = "";
    this.state.winnerId = "";
    this.state.roundEndedAt = 0;
    this.state.roundStartedAt = 0;
    this.state.simTimeMs = 0;
    for (const wire of this.state.players.values()) {
      wire.x = 0;
      wire.y = 0;
      wire.vx = 0;
      wire.vy = 0;
      wire.gravityDir = 1;
      wire.grounded = false;
      wire.alive = true;
      wire.finished = false;
      wire.finishTimeMs = 0;
      wire.survivalMs = 0;
      wire.eliminated = false;
      wire.spectator = false;
      wire.placement = 0;
      wire.progress = 0;
      wire.ready = wire.isHost ? wire.ready : false; // host keeps ready, others re-ready
    }
    this.state.phase = "LOBBY";
    this.broadcast("info", { message: "Rematch lobby open" });
  }

  // ---------- Helpers ----------

  private removePlayer(playerId: string): void {
    this.state.players.delete(playerId);
    this.spectators.delete(playerId);
    const g = this.grace.get(playerId);
    if (g?.timer) clearTimeout(g.timer);
    this.grace.delete(playerId);
    const sessionId = this.sessionByPlayerId.get(playerId);
    if (sessionId) this.playerIdBySession.delete(sessionId);
    this.sessionByPlayerId.delete(playerId);

    if (this.state.hostId === playerId) {
      const next = this.seatedPlayers()[0];
      if (next) {
        next.isHost = true;
        this.state.hostId = next.playerId;
      } else {
        this.state.hostId = "";
      }
    }
  }

  private handleGraceExpired(playerId: string): void {
    this.grace.delete(playerId);
    const seat = this.state.players.get(playerId);
    if (!seat || seat.connected) return;
    // During RUNNING: eliminate the seat.
    if ((this.state.phase === "RUNNING" || this.state.phase === "COUNTDOWN") && this.sim) {
      const p = this.sim.getPlayer(playerId);
      if (p && p.alive) {
        p.alive = false;
        p.eliminatedAtMs = this.sim.simTimeMs;
      }
      if (seat) {
        seat.alive = false;
        seat.eliminated = true;
      }
      this.broadcast("eliminated", { playerId, cause: "disconnected" });
    }
    // In LOBBY/FINISHED, just remove the seat.
    if (this.state.phase === "LOBBY" || this.state.phase === "FINISHED") {
      this.removePlayer(playerId);
    }
    // Spectators always removed.
    if (this.spectators.has(playerId)) this.removePlayer(playerId);
  }

  private seatFor(client: Client): PlayerState | undefined {
    const pid = this.playerIdBySession.get(client.sessionId);
    return pid ? this.state.players.get(pid) : undefined;
  }

  private seatedPlayers(): PlayerState[] {
    const out: PlayerState[] = [];
    for (const p of this.state.players.values()) {
      if (!p.spectator) out.push(p);
    }
    return out;
  }

  private usedColors(): Set<number> {
    const s = new Set<number>();
    for (const p of this.state.players.values()) s.add(p.color);
    return s;
  }

  /** @internal Expose private session maps so tests can assert no stale entries. */
  __testSessionMaps(): {
    sessionByPlayerId: Map<string, string>;
    playerIdBySession: Map<string, string>;
  } {
    return {
      sessionByPlayerId: this.sessionByPlayerId,
      playerIdBySession: this.playerIdBySession,
    };
  }
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function sanitizeName(v: unknown): string {
  if (typeof v !== "string" || v.length === 0) return "Player";
  const trimmed = v.trim().slice(0, 18);
  return trimmed.length === 0 ? "Player" : trimmed;
}