import type { GameMap } from "../types/map.js";

/**
 * Level 3 - Velocity Core.
 * Faster course (the simulation naturally ramps speed here), shorter reaction
 * windows and tighter obstacle combinations. ~40-60 seconds at full speed.
 */
export const velocityCore: GameMap = {
  id: "velocity-core",
  name: "Velocity Core",
  description:
    "Fast course with short reaction windows and tight obstacle combinations.",
  width: 12600,
  height: 720,
  spawn: { x: 80, y: 524 },
  finishX: 12560,
  targetSeconds: 55,
  solids: [
    // Short start floor.
    { x: 0, y: 560, w: 800, h: 160 },
    // Ceiling over an early gap (tight switch right off the line).
    { x: 800, y: 0, w: 700, h: 160 },
    // Floor + ceiling, both spiked - alternate.
    { x: 1500, y: 560, w: 900, h: 160 },
    { x: 1500, y: 0, w: 900, h: 160 },
    // Brief floor span.
    { x: 2400, y: 560, w: 600, h: 160 },
    // Ceiling over a long gap (long airborne phase).
    { x: 3000, y: 0, w: 1100, h: 160 },
    // Floor + ceiling rhythm corridor.
    { x: 4100, y: 560, w: 800, h: 160 },
    { x: 4100, y: 0, w: 800, h: 160 },
    { x: 4900, y: 560, w: 700, h: 160 },
    { x: 5600, y: 0, w: 700, h: 160 },
    // Two-stack spike alley: alternate surfaces every short span.
    { x: 6300, y: 560, w: 500, h: 160 },
    { x: 6800, y: 0, w: 500, h: 160 },
    { x: 7300, y: 560, w: 500, h: 160 },
    { x: 7800, y: 0, w: 500, h: 160 },
    // Floor + ceiling with both surfaces spiked: weave via continuous switches.
    { x: 8300, y: 560, w: 1400, h: 160 },
    { x: 8300, y: 0, w: 1400, h: 160 },
    // Ceiling quick hop before finish.
    { x: 9700, y: 0, w: 600, h: 160 },
    // Long floor run with a late floor spike.
    { x: 10300, y: 560, w: 2300, h: 160 },
    { x: 10300, y: 0, w: 2300, h: 160 },
  ],
  hazards: [
    { x: 1750, y: 520, w: 80, h: 40 },
    { x: 1900, y: 160, w: 80, h: 40 },
    { x: 2050, y: 520, w: 80, h: 40 },
    { x: 4250, y: 160, w: 80, h: 40 },
    { x: 4400, y: 520, w: 80, h: 40 },
    { x: 6450, y: 520, w: 60, h: 40 },
    { x: 6950, y: 160, w: 60, h: 40 },
    { x: 7450, y: 520, w: 60, h: 40 },
    { x: 7950, y: 160, w: 60, h: 40 },
    { x: 8700, y: 520, w: 80, h: 40 },
    { x: 8750, y: 160, w: 80, h: 40 },
    { x: 9050, y: 520, w: 80, h: 40 },
    { x: 9100, y: 160, w: 80, h: 40 },
    { x: 11400, y: 520, w: 100, h: 40 },
  ],
  decorations: [
    { type: "grid", x: 0, y: 360, w: 12600, h: 0, color: 0x10121a },
    { type: "stripe", x: 1000, y: 360, w: 6, h: 100, color: 0xff3366 },
    { type: "stripe", x: 3500, y: 360, w: 6, h: 100, color: 0xff3366 },
    { type: "stripe", x: 5500, y: 360, w: 6, h: 100, color: 0xff3366 },
    { type: "stripe", x: 8000, y: 360, w: 6, h: 100, color: 0xff3366 },
    { type: "stripe", x: 10500, y: 360, w: 6, h: 100, color: 0xff3366 },
    { type: "arrow", x: 12400, y: 360, w: 60, h: 60, color: 0xff3366 },
    { type: "star", x: 1000, y: 280, color: 0x00ffcc },
    { type: "star", x: 3500, y: 280, color: 0xff00aa },
    { type: "star", x: 6800, y: 280, color: 0x00ffcc },
    { type: "star", x: 9700, y: 280, color: 0xff3366 },
  ],
};