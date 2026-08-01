/** 2D vector in world units. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Axis-aligned rectangle in world space, stored as top-left corner + size.
 * Used for map solids, hazards and the finish sensor.
 */
export interface RectangleData {
  /** Top-left X, in world units. */
  x: number;
  /** Top-left Y, in world units. */
  y: number;
  /** Width, in world units. */
  w: number;
  /** Height, in world units. */
  h: number;
}

/**
 * Non-colliding visual flourish. The client renders these; the simulation
 * ignores them. Kept in shared so server and client agree on layout.
 */
export interface DecorationData {
  type: "stripe" | "block" | "pillar" | "arrow" | "grid" | "star";
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Hex color (0xRRGGBB) hint for the client renderer. */
  color?: number;
}
