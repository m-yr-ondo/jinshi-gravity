/**
 * Central physics + gameplay configuration for Jinshi Gravity.
 *
 * All important movement values live here. The authoritative server simulation
 * and any client-side prediction MUST read from this single config so the two
 * stay in sync. Final tunable values; do not duplicate magic numbers elsewhere.
 */

export interface SimConfig {
  /** Simulation ticks per second. */
  readonly tickRate: number;
  /** Milliseconds per fixed tick (derived from tickRate). */
  readonly tickDtMs: number;
  /** Horizontal run speed at round start, in world units / second. */
  readonly initialRunSpeed: number;
  /** Horizontal run speed ceiling, in world units / second. */
  readonly maxRunSpeed: number;
  /** Horizontal speed gained per second of running, in units / second. */
  readonly speedRampPerSec: number;
  /** Gravity acceleration magnitude, in units / second^2. */
  readonly gravityMagnitude: number;
  /** Vertical velocity instantly applied on a gravity switch, in units / second. */
  readonly switchVerticalSpeed: number;
  /** Absolute vertical velocity ceiling, in units / second. */
  readonly maxVerticalSpeed: number;
  /** Player collision box width, in world units. */
  readonly playerWidth: number;
  /** Player collision box height, in world units. */
  readonly playerHeight: number;
  /** Minimum time between accepted gravity-switch inputs, in milliseconds. */
  readonly inputCooldownMs: number;
  /** Finish-line sensor thickness, in world units. */
  readonly finishLineThickness: number;
  /** A player this many world units behind the leader is eliminated. */
  readonly fallBehindLimit: number;
  /** Reconnection grace period before a disconnected seat is eliminated, in ms. */
  readonly reconnectGraceMs: number;
  /** Server -> client state snapshots per second. */
  readonly broadcastRate: number;
  /** Minimum ready players to start a multiplayer round. */
  readonly minPlayers: number;
  /** Maximum concurrent players in one room. */
  readonly maxPlayers: number;
  /** Countdown duration in milliseconds before RUNNING. */
  readonly countdownMs: number;
}

function makeConfig(): SimConfig {
  const tickRate = 60;
  return {
    tickRate,
    tickDtMs: 1000 / tickRate,
    initialRunSpeed: 280,
    maxRunSpeed: 420,
    speedRampPerSec: 6,
    gravityMagnitude: 1600,
    switchVerticalSpeed: 420,
    maxVerticalSpeed: 700,
    playerWidth: 28,
    playerHeight: 36,
    inputCooldownMs: 80,
    finishLineThickness: 12,
    fallBehindLimit: 1400,
    reconnectGraceMs: 15000,
    broadcastRate: 20,
    minPlayers: 2,
    maxPlayers: 8,
    countdownMs: 3000,
  };
}

export const SIM_CONFIG: SimConfig = makeConfig();

/**
 * Build a config with overrides. Used by tests to create deterministic,
 * hermetic scenarios without mutating the shared production config.
 */
export function makeSimConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return { ...makeConfig(), ...overrides };
}
