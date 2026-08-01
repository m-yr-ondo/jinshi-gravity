import { Client, type Room as SDKRoom } from "@colyseus/sdk";
import { ALL_MAPS, getMapById, type GravityMatchResult, type GameMap, type RoundPhase } from "@jinshi-gravity/shared";

const SERVER_URL =
  import.meta.env.VITE_GRAVITY_SERVER_URL ??
  (typeof window !== "undefined" ? `ws://${window.location.hostname}:2568` : "ws://localhost:2568");

export interface GravityRoomStateShape {
  phase: RoundPhase;
  mode: "multiplayer" | "practice";
  code: string;
  mapId: string;
  hostId: string;
  countdownEndsAt: number;
  roundStartedAt: number;
  roundEndedAt: number;
  simTimeMs: number;
  resultReason: string;
  winnerId: string;
  rematchRequired: number;
  players: Map<string, PlayerStateShape>;
  leaderboard: LeaderboardEntryShape[];
  rematchVoters: string[];
}

export interface PlayerStateShape {
  playerId: string;
  sessionId: string;
  displayName: string;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  progress: number;
  gravityDir: number;
  grounded: boolean;
  alive: boolean;
  finished: boolean;
  finishTimeMs: number;
  survivalMs: number;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
  eliminated: boolean;
  spectator: boolean;
  placement: number;
}

export interface LeaderboardEntryShape {
  playerId: string;
  displayName: string;
  placement: number;
  finished: boolean;
  eliminated: boolean;
  progress: number;
  survivalMs: number;
}

export interface RoomSnapshot {
  state: GravityRoomStateShape;
  roomId: string;
  sessionId: string;
}

/**
 * Wrap the Colyseus SDK Room in a TS-typed API surface the UI and the Phaser
 * scenes both consume. The decoded schema state lives on `sdk.state`; we expose
 * a typed accessor and the message subscriptions plus a small send helper.
 */
export class GravityRoomController {
  readonly sdk: SDKRoom<GravityRoomStateShape>;
  readonly localPlayerId: string;
  private nextSequence = 1;
  private lastInputMs = 0;
  private disposed = false;

  constructor(sdk: SDKRoom<GravityRoomStateShape>, localPlayerId: string) {
    this.sdk = sdk;
    this.localPlayerId = localPlayerId;
  }

  static get availableMaps(): readonly GameMap[] {
    return ALL_MAPS;
  }

  get state(): GravityRoomStateShape {
    return this.sdk.state as unknown as GravityRoomStateShape;
  }

  get roomId(): string {
    return this.sdk.roomId;
  }

  get sessionId(): string {
    return this.sdk.sessionId;
  }

  get map(): GameMap | undefined {
    return getMapById(this.state.mapId) ?? getMapById("training-run");
  }

  onStateChange(cb: (state: GravityRoomStateShape) => void): () => void {
    const wrapped = cb as (state: unknown) => void;
    this.sdk.onStateChange(wrapped);
    return () => this.sdk.onStateChange.remove(wrapped);
  }

  onMessage(
    type: string,
    cb: (message: any) => void,
  ): () => void {
    const wrapped = cb as (payload: unknown) => void;
    return this.sdk.onMessage(type, wrapped as never);
  }

  onLeave(cb: (code: number) => void): () => void {
    const wrapped = cb as (code: number, reason?: string) => void;
    this.sdk.onLeave(wrapped);
    return () => this.sdk.onLeave.remove(wrapped);
  }

  onError(cb: (code: number, message?: string) => void): () => void {
    this.sdk.onError(cb);
    return () => this.sdk.onError.remove(cb);
  }

  sendSetName(name: string): void {
    this.sdk.send("set-name", { name });
  }

  sendSetReady(ready: boolean): void {
    this.sdk.send("set-ready", { ready });
  }

  sendSelectMap(mapId: string): void {
    this.sdk.send("select-map", { mapId });
  }

  sendStartRound(): void {
    this.sdk.send("start-round", {});
  }

  sendStartPractice(): void {
    this.sdk.send("request-practice", {});
  }

  sendGravitySwitch(clientTime: number): number {
    const seq = this.nextSequence++;
    this.lastInputMs = Date.now();
    this.sdk.send("gravity-switch", { sequence: seq, clientTime });
    return seq;
  }

  sendVoteRematch(rematch: boolean): void {
    this.sdk.send("vote-rematch", { rematch });
  }

  async leave(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.sdk.leave();
    } catch {
      /* ignore */
    }
  }
}

export interface ConnectOptions {
  playerId: string;
  displayName: string;
  mode: "multiplayer" | "practice";
  code?: string;
  mapId?: string;
}

/** Colyseus SDK client. Recreated per join so sessions don't cross-link. */
export function makeClient(): Client {
  return new Client(SERVER_URL);
}

export async function createRoom(opts: ConnectOptions): Promise<GravityRoomController> {
  const client = makeClient();
  const sdk = await client.create("gravity", filterOptions(opts));
  return new GravityRoomController(sdk as never, opts.playerId);
}

export async function joinRoom(opts: ConnectOptions): Promise<GravityRoomController> {
  const client = makeClient();
  const sdk = await client.join("gravity", filterOptions(opts));
  return new GravityRoomController(sdk as never, opts.playerId);
}

function filterOptions(opts: ConnectOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {
    playerId: opts.playerId,
    displayName: opts.displayName,
    mode: opts.mode,
  };
  if (opts.code && opts.code.length > 0) out.code = opts.code;
  if (opts.mapId) out.mapId = opts.mapId;
  return out;
}

export type { GravityMatchResult };