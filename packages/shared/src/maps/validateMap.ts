import type { GameMap } from "../types/map.js";

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function validateRect(
  rect: unknown,
  label: string,
  errors: string[],
): void {
  if (typeof rect !== "object" || rect === null) {
    errors.push(`${label}: not an object`);
    return;
  }
  const r = rect as Record<string, unknown>;
  for (const key of ["x", "y", "w", "h"] as const) {
    if (!isFiniteNumber(r[key])) {
      errors.push(`${label}: field "${key}" is missing or not a finite number`);
    }
  }
  if (
    isFiniteNumber(r.w) &&
    isFiniteNumber(r.h) &&
    (r.w as number) <= 0
  ) {
    errors.push(`${label}: width must be > 0`);
  }
  if (
    isFiniteNumber(r.w) &&
    isFiniteNumber(r.h) &&
    (r.h as number) <= 0
  ) {
    errors.push(`${label}: height must be > 0`);
  }
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Validate a single map for structural correctness.
 * Rejects: invalid rectangles, finish outside the map, spawn inside a hazard,
 * and missing required fields.
 */
export function validateMap(map: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof map !== "object" || map === null) {
    return { ok: false, errors: ["map: not an object"] };
  }
  const m = map as Record<string, unknown>;

  if (typeof m.id !== "string" || m.id.length === 0) {
    errors.push("map: missing or empty string field \"id\"");
  }
  if (typeof m.name !== "string" || m.name.length === 0) {
    errors.push("map: missing or empty string field \"name\"");
  }
  if (typeof m.description !== "string") {
    errors.push("map: missing string field \"description\"");
  }
  if (!isFiniteNumber(m.width) || (m.width as number) <= 0) {
    errors.push("map: \"width\" must be a positive finite number");
  }
  if (!isFiniteNumber(m.height) || (m.height as number) <= 0) {
    errors.push("map: \"height\" must be a positive finite number");
  }
  if (typeof m.spawn !== "object" || m.spawn === null || !isFiniteNumber((m.spawn as Record<string, unknown>).x) || !isFiniteNumber((m.spawn as Record<string, unknown>).y)) {
    errors.push("map: \"spawn\" must be { x, y } with finite numbers");
  }
  if (!isFiniteNumber(m.finishX)) {
    errors.push("map: \"finishX\" must be a finite number");
  }
  if (!Array.isArray(m.solids)) {
    errors.push("map: \"solids\" must be an array");
  }
  if (!Array.isArray(m.hazards)) {
    errors.push("map: \"hazards\" must be an array");
  }
  if (!isFiniteNumber(m.targetSeconds) || (m.targetSeconds as number) <= 0) {
    errors.push("map: \"targetSeconds\" must be a positive finite number");
  }

  if (errors.length > 0) return { ok: false, errors };

  // From here, core fields are present and finite.
  const mm = m as unknown as GameMap;

  // Finish line inside the map and ahead of spawn.
  if (mm.finishX <= mm.spawn.x) {
    errors.push(`map "${mm.id}": finishX (${mm.finishX}) must be greater than spawn.x (${mm.spawn.x})`);
  }
  if (mm.finishX > mm.width) {
    errors.push(`map "${mm.id}": finishX (${mm.finishX}) is outside map width (${mm.width})`);
  }
  if (mm.finishX < 0) {
    errors.push(`map "${mm.id}": finishX (${mm.finishX}) is negative`);
  }

  // Spawn inside the map bounds.
  if (mm.spawn.x < 0 || mm.spawn.x > mm.width) {
    errors.push(`map "${mm.id}": spawn.x is outside map bounds`);
  }
  if (mm.spawn.y < 0 || mm.spawn.y > mm.height) {
    errors.push(`map "${mm.id}": spawn.y is outside map bounds`);
  }

  // Validate every solid + hazard rectangle.
  mm.solids.forEach((s, i) => validateRect(s, `map "${mm.id}" solid[${i}]`, errors));
  mm.hazards.forEach((h, i) => validateRect(h, `map "${mm.id}" hazard[${i}]`, errors));

  // Rectangles inside map bounds.
  for (const s of mm.solids) {
    if (s.x < 0 || s.y < 0 || s.x + s.w > mm.width + 1 || s.y + s.h > mm.height + 1) {
      errors.push(`map "${mm.id}": solid {x:${s.x},y:${s.y},w:${s.w},h:${s.h}} extends outside the map`);
    }
  }
  for (const h of mm.hazards) {
    if (h.x < 0 || h.y < 0 || h.x + h.w > mm.width + 1 || h.y + h.h > mm.height + 1) {
      errors.push(`map "${mm.id}": hazard {x:${h.x},y:${h.y},w:${h.w},h:${h.h}} extends outside the map`);
    }
  }

  // Spawn point must not be inside a hazard.
  const spawnBox = { x: mm.spawn.x, y: mm.spawn.y, w: 28, h: 36 };
  for (let i = 0; i < mm.hazards.length; i++) {
    if (rectsOverlap(spawnBox, mm.hazards[i]!)) {
      errors.push(`map "${mm.id}": spawn point overlaps hazard[${i}]`);
      break;
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validate a collection of maps, additionally rejecting duplicate IDs.
 */
export function validateMaps(maps: unknown[]): ValidationResult {
  const allErrors: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < maps.length; i++) {
    const single = validateMap(maps[i]);
    if (!single.ok) {
      for (const e of single.errors) allErrors.push(`maps[${i}]: ${e}`);
      // Still try to read id for duplicate check.
    }
    const m = maps[i] as Record<string, unknown> | null;
    if (m && typeof m.id === "string") {
      if (seenIds.has(m.id)) {
        allErrors.push(`duplicate map id "${m.id}"`);
      } else {
        seenIds.add(m.id);
      }
    }
  }

  return allErrors.length === 0 ? { ok: true } : { ok: false, errors: allErrors };
}
