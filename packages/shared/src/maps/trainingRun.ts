import type { GameMap } from "../types/map.js";

/**
 * Level 1 - Training Run.
 * Easy introduction: wide platforms, clear gravity-switch opportunities,
 * generous timing windows. ~20-30 seconds.
 */
export const trainingRun: GameMap = {
  id: "training-run",
  name: "Training Run",
  description: "Easy introduction with wide platforms and clear switch points.",
  width: 8800,
  height: 720,
  spawn: { x: 80, y: 524 },
  finishX: 8760,
  targetSeconds: 25,
  solids: [
    // Section 1: floor start.
    { x: 0, y: 560, w: 1800, h: 160 },
    // Section 2: ceiling over the first gap.
    { x: 1800, y: 0, w: 1000, h: 160 },
    // Section 3: floor + ceiling (hazard on floor, stay on ceiling).
    { x: 2800, y: 560, w: 1400, h: 160 },
    { x: 2800, y: 0, w: 1400, h: 160 },
    // Section 4: ceiling over the second gap.
    { x: 4200, y: 0, w: 1000, h: 160 },
    // Section 5: floor + ceiling (hazard on ceiling, switch down to floor).
    { x: 5200, y: 560, w: 1200, h: 160 },
    { x: 5200, y: 0, w: 1200, h: 160 },
    // Section 6: floor with a ceiling hop over a floor spike.
    { x: 6400, y: 560, w: 1000, h: 160 },
    { x: 6700, y: 0, w: 600, h: 160 },
    // Section 7: floor run to the finish.
    { x: 7400, y: 560, w: 1400, h: 160 },
  ],
  hazards: [
    // Floor spike in section 3: stay on the ceiling to pass safely.
    { x: 3400, y: 520, w: 120, h: 40 },
    // Ceiling spike in section 5: switch down to the floor to pass safely.
    { x: 5800, y: 160, w: 120, h: 40 },
    // Floor spike in section 6: hop onto the ceiling patch, then back down.
    { x: 6900, y: 520, w: 100, h: 40 },
  ],
  decorations: [
    { type: "grid", x: 0, y: 360, w: 8800, h: 0, color: 0x1a1a2e },
    { type: "stripe", x: 600, y: 360, w: 8, h: 80, color: 0x2a2a4e },
    { type: "stripe", x: 3500, y: 360, w: 8, h: 80, color: 0x2a2a4e },
    { type: "stripe", x: 6500, y: 360, w: 8, h: 80, color: 0x2a2a4e },
    { type: "arrow", x: 8600, y: 360, w: 60, h: 60, color: 0x00ffcc },
    { type: "star", x: 2000, y: 400, color: 0x00ffcc },
    { type: "star", x: 4500, y: 300, color: 0xff00aa },
  ],
};
