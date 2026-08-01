export { trainingRun } from "./trainingRun.js";
export { splitCircuit } from "./splitCircuit.js";
export { velocityCore } from "./velocityCore.js";
export { validateMap, validateMaps } from "./validateMap.js";
export type { ValidationResult } from "./validateMap.js";

import { trainingRun } from "./trainingRun.js";
import { splitCircuit } from "./splitCircuit.js";
import { velocityCore } from "./velocityCore.js";
import type { GameMap } from "../types/map.js";
import { validateMaps } from "./validateMap.js";

/** All built-in maps, in level order. Always validated at import time. */
export const ALL_MAPS: GameMap[] = [trainingRun, splitCircuit, velocityCore];

const importTimeValidation = validateMaps(ALL_MAPS);
if (!importTimeValidation.ok) {
  throw new Error(
    `Built-in map validation failed:\n${importTimeValidation.errors.join("\n")}`,
  );
}

/** Look up a map by id. Returns undefined if not found. */
export function getMapById(id: string): GameMap | undefined {
  return ALL_MAPS.find((m) => m.id === id);
}