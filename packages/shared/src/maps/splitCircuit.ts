import type { GameMap } from "../types/map.js";

/**
 * Level 2 - Split Circuit.
 * Alternating ceiling and floor sections with gaps and stationary hazards,
 * tighter switch timing than Training Run. ~30-45 seconds.
 */
export const splitCircuit: GameMap = {
  id: "split-circuit",
  name: "Split Circuit",
  description:
    "Alternating ceiling/floor sections with gaps and stationary hazards.",
  width: 11200,
  height: 720,
  spawn: { x: 80, y: 524 },
  finishX: 11160,
  targetSeconds: 40,
  solids: [
    // Start floor.
    { x: 0, y: 560, w: 1400, h: 160 },
    // First ceiling island over a gap.
    { x: 1400, y: 0, w: 1000, h: 160 },
    // Floor + ceiling corridor with a hazard on the ceiling.
    { x: 2400, y: 560, w: 1400, h: 160 },
    { x: 2400, y: 0, w: 1400, h: 160 },
    // Floor-only section with a tall ceiling spike to avoid.
    { x: 3800, y: 560, w: 1200, h: 160 },
    // Ceiling over a wide gap (forces long airborne switch).
    { x: 5000, y: 0, w: 1200, h: 160 },
    // Floor + ceiling with both floors spiked.
    { x: 6200, y: 560, w: 1200, h: 160 },
    { x: 6200, y: 0, w: 1200, h: 160 },
    // Ceiling-only over a gap.
    { x: 7400, y: 0, w: 900, h: 160 },
    // Floor + ceiling interleave rhythm.
    { x: 8300, y: 560, w: 900, h: 160 },
    { x: 9200, y: 0, w: 900, h: 160 },
    { x: 10100, y: 560, w: 1100, h: 160 },
    // Finish roof + floor.
    { x: 10100, y: 0, w: 1100, h: 160 },
  ],
  hazards: [
    // Ceiling hazard in the first double-corridor: switch down to floor.
    { x: 2900, y: 160, w: 120, h: 40 },
    // Floor spike in the floor-only section: jump up briefly, then come back.
    { x: 4300, y: 520, w: 120, h: 40 },
    // Both corridor surfaces spiked - alternate rhythm required.
    { x: 6600, y: 520, w: 100, h: 40 },
    { x: 6700, y: 160, w: 100, h: 40 },
    // Late ceiling spike into final rhythm.
    { x: 9450, y: 160, w: 90, h: 40 },
  ],
  decorations: [
    { type: "grid", x: 0, y: 360, w: 11200, h: 0, color: 0x142033 },
    { type: "stripe", x: 2400, y: 360, w: 8, h: 80, color: 0x2a2a4e },
    { type: "stripe", x: 3800, y: 360, w: 8, h: 80, color: 0x2a2a4e },
    { type: "stripe", x: 6200, y: 360, w: 8, h: 80, color: 0x2a2a4e },
    { type: "stripe", x: 8300, y: 360, w: 8, h: 80, color: 0x2a2a4e },
    { type: "arrow", x: 10950, y: 360, w: 60, h: 60, color: 0x00ffcc },
    { type: "star", x: 1500, y: 400, color: 0xff3366 },
    { type: "star", x: 5000, y: 280, color: 0x00ffcc },
    { type: "star", x: 7400, y: 280, color: 0xff00aa },
  ],
};