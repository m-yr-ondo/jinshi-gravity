/**
 * Gravity direction.
 *  1 = downward (player runs on a floor below them).
 * -1 = upward   (player runs on a ceiling above them).
 */
export type GravityDirection = 1 | -1;

/**
 * Round phase machine. The server owns these transitions.
 * LOBBY -> COUNTDOWN -> RUNNING -> FINISHED -> (rematch) LOBBY.
 */
export type RoundPhase = "LOBBY" | "COUNTDOWN" | "RUNNING" | "FINISHED";

/**
 * Authoritative per-player runtime state held by the simulation.
 * The server replicates a projection of this to clients via Colyseus schema.
 */
export interface PlayerRuntimeState {
  playerId: string;
  displayName: string;
  /** Hex color (0xRRGGBB). */
  color: number;
  /** Top-left X of the player box. */
  x: number;
  /** Top-left Y of the player box. */
  y: number;
  /** Horizontal velocity, world units / second (always >= 0). */
  vx: number;
  /** Vertical velocity, world units / second. */
  vy: number;
  /** Current gravity direction. */
  gravityDir: GravityDirection;
  /** True when resting on a floor or ceiling this tick. */
  grounded: boolean;
  /** True while the player is still racing. */
  alive: boolean;
  /** True once the player crossed the finish line. */
  finished: boolean;
  /** Sim time (ms) at which the player finished, 0 if not finished. */
  finishTimeMs: number;
  /** Greatest horizontal progress reached, used for tiebreaks and display. */
  progress: number;
  /** Last accepted input sequence number. */
  inputSequence: number;
  /** Sim time (ms) of last accepted input, for cooldown enforcement. */
  lastInputMs: number;
  /** Sim time (ms) at elimination, or null. */
  eliminatedAtMs: number | null;
  /** Sim time (ms) the player has survived in the current round. */
  survivalMs: number;
  /** Lobby flag: ready to start. */
  ready: boolean;
  /** Lobby flag: this seat is the room host. */
  isHost: boolean;
  /** Network flag: currently connected (false during reconnection grace). */
  connected: boolean;
}

/**
 * Events emitted by a single simulation tick, consumed by the server room
 * to update phase, broadcast notices and decide winners.
 */
export interface TickEvents {
  /** Player IDs that died this tick, with cause. */
  deaths: Array<{ playerId: string; cause: DeathCause }>;
  /** Player IDs that crossed the finish line this tick, in tick order. */
  finishes: Array<{ playerId: string; simTimeMs: number }>;
}

export type DeathCause =
  | "hazard"
  | "out-of-bounds"
  | "crush"
  | "fell-behind"
  | "disconnected";

/**
 * Result of validating + applying a client input on the server.
 */
export type InputResult =
  | { ok: true; sequence: number }
  | { ok: false; reason: InputRejectReason };

export type InputRejectReason =
  | "unknown-player"
  | "not-running"
  | "spectator-or-dead"
  | "duplicate-sequence"
  | "sequence-not-increasing"
  | "cooldown";

/**
 * Client -> server intention. The only gameplay input in the game.
 */
export interface GravitySwitchInput {
  type: "gravity-switch";
  sequence: number;
  clientTime: number;
}
