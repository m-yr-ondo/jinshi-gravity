/**
 * Future-facing match result. Built by the server at the end of a round and
 * stored in shared so the server, tests and (later) Jinshi agree on the shape.
 *
 * In THIS phase the result is constructed and logged/returned by the room but
 * is NOT sent anywhere. docs/FUTURE_INTEGRATION.md describes how it would be
 * translated into a Jinshi internal API request later.
 */
export interface GravityMatchResultPlacement {
  playerId: string;
  displayName: string;
  /** 1-based finishing position. */
  placement: number;
  /** True if the player crossed the finish line. */
  finished: boolean;
  /** True if the player was eliminated before finishing. */
  eliminated: boolean;
  /** Greatest horizontal progress reached, in world units. */
  progress: number;
  /** Time survived in the round, in milliseconds. */
  survivalMs: number;
}

export interface GravityMatchResult {
  gameId: string;
  roomId: string;
  mapId: string;
  reason: "finish" | "last-survivor" | "all-eliminated" | "draw";
  /** ISO 8601 timestamp the round started. */
  startedAt: string;
  /** ISO 8601 timestamp the round ended. */
  endedAt: string;
  placements: GravityMatchResultPlacement[];
  /** Player ID of the winner, omitted only on a pure draw. */
  winnerId?: string;
}
