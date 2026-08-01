import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

/**
 * Authoritative round phase the server pushes to clients.
 * Strings are intentionally narrow to keep the wire format debuggable.
 */
export type RoundPhase = "LOBBY" | "COUNTDOWN" | "RUNNING" | "FINISHED";

/**
 * Per-player replication state. Keyed by the stable local playerId (NOT by the
 * Colyseus sessionId) so a browser refresh that updates the WebSocket session
 * can still resume the same seat inside the reconnection grace period.
 */
export class PlayerState extends Schema {
  @type("string") playerId = "";
  @type("string") sessionId = "";
  @type("string") displayName = "";
  @type("number") color = 0xffffff;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") progress = 0;
  @type("int8") gravityDir = 1;
  @type("boolean") grounded = false;
  @type("boolean") alive = true;
  @type("boolean") finished = false;
  @type("number") finishTimeMs = 0;
  @type("number") survivalMs = 0;
  @type("boolean") ready = false;
  @type("boolean") isHost = false;
  @type("boolean") connected = true;
  @type("boolean") eliminated = false;
  @type("boolean") spectator = false;
  @type("int8") placement = 0;
}

/**
 * Final standings row shown on the results screen and used by tests to verify
 * server-authoritative placement.
 */
export class LeaderboardEntry extends Schema {
  @type("string") playerId = "";
  @type("string") displayName = "";
  @type("int8") placement = 0;
  @type("boolean") finished = false;
  @type("boolean") eliminated = false;
  @type("number") progress = 0;
  @type("number") survivalMs = 0;
}

/**
 * Full room state, replicated by Colyseus. The room mutates a projection of
 * the simulation into this schema every tick; Colyseus ships the deltas to
 * clients at the configured patch rate (~20 Hz).
 */
export class GravityRoomState extends Schema {
  @type("string") phase: RoundPhase = "LOBBY";
  @type("string") mode: "multiplayer" | "practice" = "multiplayer";
  @type("string") code = "";
  @type("string") mapId = "training-run";
  @type("string") hostId = "";
  @type("number") countdownEndsAt = 0;
  @type("number") roundStartedAt = 0;
  @type("number") roundEndedAt = 0;
  @type("number") simTimeMs = 0;
  @type("string") resultReason = "";
  @type("string") winnerId = "";
  @type("number") rematchRequired = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([LeaderboardEntry]) leaderboard = new ArraySchema<LeaderboardEntry>();
  @type(["string"]) rematchVoters = new ArraySchema<string>();
}