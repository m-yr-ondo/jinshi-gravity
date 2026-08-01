import type { DecorationData, RectangleData, Vec2 } from "./primitives.js";

/**
 * A complete, data-driven level. Both server and client load the same map
 * data from packages/shared. Maps are never hard-coded into Phaser scenes.
 */
export interface GameMap {
  /** Stable unique identifier, e.g. "training-run". */
  id: string;
  /** Human-readable name shown in the lobby and results. */
  name: string;
  /** One-line description for the level-select screen. */
  description: string;
  /** Total course width in world units. */
  width: number;
  /** Total course height in world units. */
  height: number;
  /** Shared spawn position. All players start at the same horizontal X. */
  spawn: Vec2;
  /** X position of the finish-line sensor. */
  finishX: number;
  /** Solid platforms (floors and ceilings). */
  solids: RectangleData[];
  /** Lethal obstacles. Touching any kills the player. */
  hazards: RectangleData[];
  /** Optional non-colliding visual decorations. */
  decorations?: DecorationData[];
  /** Suggested target clear time in seconds, for display only. */
  targetSeconds: number;
}
