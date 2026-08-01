import type { SimConfig } from "../config/sim-config.js";
import { SIM_CONFIG } from "../config/sim-config.js";
import type { GameMap } from "../types/map.js";
import type {
  DeathCause,
  GravityDirection,
  GravitySwitchInput,
  InputResult,
  PlayerRuntimeState,
  TickEvents,
} from "../types/simulation.js";
import { aabbOverlap, sweepHorizontal, sweepVertical, type Rect } from "./collision.js";

/** A rect snapshot of a player's collision box at a given position. */
function playerBox(
  x: number,
  y: number,
  cfg: SimConfig,
): Rect {
  return { x, y, w: cfg.playerWidth, h: cfg.playerHeight };
}

/** Clamp `v` into [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Deterministic, server-authoritative gravity-switch racing simulation.
 *
 * Pure TypeScript: no Phaser, no Colyseus, no DOM, no I/O. The server drives
 * this with fixed ticks and validated inputs; tests drive it directly to prove
 * determinism. Identical config + identical input sequences yield identical
 * state, bit-for-bit.
 */
export class GravitySimulation {
  readonly map: GameMap;
  readonly config: SimConfig;
  /** Player runtime states keyed by playerId. Insertion order is stable. */
  readonly players = new Map<string, PlayerRuntimeState>();
  /** Sim clock in milliseconds, advanced once per tick. */
  simTimeMs = 0;
  /** Sim time (ms) at which the current round started (RUNNING began). */
  roundStartMs = 0;

  constructor(map: GameMap, config: SimConfig = SIM_CONFIG) {
    this.map = map;
    this.config = config;
  }

  /** Add a player seat. Returns the created runtime state. */
  addPlayer(playerId: string, displayName: string, color: number): PlayerRuntimeState {
    const existing = this.players.get(playerId);
    if (existing) return existing;
    const state: PlayerRuntimeState = {
      playerId,
      displayName,
      color,
      x: this.map.spawn.x,
      y: this.map.spawn.y,
      vx: this.config.initialRunSpeed,
      vy: 0,
      gravityDir: 1,
      grounded: true,
      alive: true,
      finished: false,
      finishTimeMs: 0,
      progress: this.map.spawn.x,
      inputSequence: 0,
      lastInputMs: Number.NEGATIVE_INFINITY,
      eliminatedAtMs: null,
      survivalMs: 0,
      ready: false,
      isHost: false,
      connected: true,
    };
    this.players.set(playerId, state);
    return state;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
  }

  getPlayer(playerId: string): PlayerRuntimeState | undefined {
    return this.players.get(playerId);
  }

  /** Number of players still actively racing (alive and not finished). */
  activeRacerCount(): number {
    let n = 0;
    for (const p of this.players.values()) {
      if (p.alive && !p.finished) n++;
    }
    return n;
  }

  aliveCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.alive) n++;
    return n;
  }

  /** Greatest horizontal progress among active racers, for fall-behind checks. */
  leaderX(): number {
    let lead = Number.NEGATIVE_INFINITY;
    for (const p of this.players.values()) {
      if (p.alive && !p.finished && p.x > lead) lead = p.x;
    }
    return lead === Number.NEGATIVE_INFINITY ? this.map.spawn.x : lead;
  }

  /**
   * Reset every player to the spawn and clear round state. Called when the
   * server transitions into RUNNING.
   */
  resetRound(): void {
    this.simTimeMs = 0;
    this.roundStartMs = 0;
    for (const p of this.players.values()) {
      p.x = this.map.spawn.x;
      p.y = this.map.spawn.y;
      p.vx = this.config.initialRunSpeed;
      p.vy = 0;
      p.gravityDir = 1;
      p.grounded = true;
      p.alive = true;
      p.finished = false;
      p.finishTimeMs = 0;
      p.progress = this.map.spawn.x;
      p.inputSequence = 0;
      p.lastInputMs = Number.NEGATIVE_INFINITY;
      p.eliminatedAtMs = null;
      p.survivalMs = 0;
    }
  }

  /** Mark the round as started (RUNNING); fixes the survival clock origin. */
  startRound(): void {
    this.roundStartMs = 0;
    this.simTimeMs = 0;
  }

  /**
   * Validate and apply a gravity-switch input for a player.
   * Deterministic: mutates only the target player's gravity + vertical velocity.
   */
  applyInput(playerId: string, input: GravitySwitchInput): InputResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, reason: "unknown-player" };
    // Inputs are only meaningful during RUNNING; the room enforces phase but
    // the sim double-checks so tests cannot bypass it.
    if (!p.alive || p.finished) return { ok: false, reason: "spectator-or-dead" };
    if (input.sequence <= p.inputSequence) {
      return input.sequence === p.inputSequence
        ? { ok: false, reason: "duplicate-sequence" }
        : { ok: false, reason: "sequence-not-increasing" };
    }
    if (this.simTimeMs - p.lastInputMs < this.config.inputCooldownMs) {
      return { ok: false, reason: "cooldown" };
    }
    // Apply the switch.
    p.gravityDir = (p.gravityDir * -1) as GravityDirection;
    p.vy = p.gravityDir * this.config.switchVerticalSpeed;
    p.inputSequence = input.sequence;
    p.lastInputMs = this.simTimeMs;
    p.grounded = false;
    return { ok: true, sequence: input.sequence };
  }

  /**
   * Advance the whole world by exactly one fixed tick. Returns the deaths and
   * finishes that occurred this tick, in stable player insertion order.
   *
   * Players are independent (no inter-player collisions), so processing order
   * does not affect physics. The result is deterministic given identical inputs.
   */
  tick(): TickEvents {
    const cfg = this.config;
    const dt = cfg.tickDtMs / 1000;
    this.simTimeMs += cfg.tickDtMs;

    const deaths: TickEvents["deaths"] = [];
    const finishes: TickEvents["finishes"] = [];

    const leader = this.leaderX();

    for (const p of this.players.values()) {
      if (!p.alive || p.finished) continue;

      // 1. Horizontal speed ramp toward the ceiling.
      p.vx = Math.min(p.vx + cfg.speedRampPerSec * dt, cfg.maxRunSpeed);

      // 2. Gravity integration (vertical).
      p.vy += p.gravityDir * cfg.gravityMagnitude * dt;
      p.vy = clamp(p.vy, -cfg.maxVerticalSpeed, cfg.maxVerticalSpeed);

      // 3. Horizontal move + wall resolution (rare in this game).
      const prevX = p.x;
      const nextX = p.x + p.vx * dt;
      const hRes = sweepHorizontal(playerBox(prevX, p.y, cfg), prevX, nextX, this.map.solids);
      p.x = hRes.x;
      if (hRes.hitWall) p.vx = 0;

      // 4. Vertical move + surface resolution (swept to avoid tunneling).
      const prevY = p.y;
      const nextY = p.y + p.vy * dt;
      const vRes = sweepVertical(playerBox(p.x, prevY, cfg), prevY, nextY, this.map.solids);
      p.y = vRes.y;
      if (vRes.hitDown || vRes.hitUp) {
        p.vy = 0;
        p.grounded = true;
      } else {
        p.grounded = false;
      }

      // 5. Progress + survival bookkeeping.
      if (p.x > p.progress) p.progress = p.x;
      p.survivalMs = this.simTimeMs - this.roundStartMs;

      // 6. Finish check (takes priority over death at the line).
      if (p.x + cfg.playerWidth >= this.map.finishX) {
        p.finished = true;
        p.finishTimeMs = this.simTimeMs;
        finishes.push({ playerId: p.playerId, simTimeMs: this.simTimeMs });
        continue;
      }

      // 7. Death checks.
      const box = playerBox(p.x, p.y, cfg);
      let cause: DeathCause | null = null;
      for (const hz of this.map.hazards) {
        if (aabbOverlap(box, hz)) {
          cause = "hazard";
          break;
        }
      }
      if (cause === null) {
        const outTop = p.y + cfg.playerHeight < 0;
        const outBottom = p.y > this.map.height;
        if (outTop || outBottom) cause = "out-of-bounds";
      }
      if (cause === null) {
        if (p.x < leader - cfg.fallBehindLimit) cause = "fell-behind";
      }
      if (cause !== null) {
        p.alive = false;
        p.eliminatedAtMs = this.simTimeMs;
        p.survivalMs = this.simTimeMs - this.roundStartMs;
        deaths.push({ playerId: p.playerId, cause });
      }
    }

    return { deaths, finishes };
  }
}
