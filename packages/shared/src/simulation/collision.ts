import type { RectangleData } from "../types/primitives.js";

/** Static rectangle for collision queries. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True if two static AABBs overlap (touching edges do NOT count as overlap). */
export function aabbOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Resolve the vertical movement of a moving box against a set of solids using
 * swept AABB detection, so thin platforms cannot be tunneled at high speed.
 *
 * @param box      moving box (current position before this vertical step)
 * @param prevY    box top Y before the vertical move
 * @param nextY    box top Y after the vertical move
 * @param solids   static solids to test against
 * @returns the resolved Y and a normal describing any surface hit
 */
export function sweepVertical(
  box: Rect,
  prevY: number,
  nextY: number,
  solids: ReadonlyArray<RectangleData>,
): { y: number; hitDown: boolean; hitUp: boolean } {
  const dy = nextY - prevY;
  if (dy === 0) {
    // No vertical movement: only settle if already overlapping (shouldn't happen
    // with correct spawning, but guard against penetration).
    for (const s of solids) {
      if (aabbOverlap(box, s)) {
        // push to nearest free edge depending on which side is closer
        const overlapTop = box.y + box.h - s.y;
        const overlapBottom = s.y + s.h - box.y;
        if (overlapTop < overlapBottom) {
          return { y: s.y - box.h, hitDown: true, hitUp: false };
        }
        return { y: s.y + s.h, hitDown: false, hitUp: true };
      }
    }
    return { y: nextY, hitDown: false, hitUp: false };
  }

  let resolvedY = nextY;
  let hitDown = false;
  let hitUp = false;

  // Moving down: look for the first solid whose top the box crosses.
  if (dy > 0) {
    let bestTop = Number.POSITIVE_INFINITY;
    let collided = false;
    for (const s of solids) {
      // Horizontal overlap required for the box to land on this solid.
      if (box.x + box.w <= s.x || box.x >= s.x + s.w) continue;
      // The box's bottom must cross the solid's top within this step.
      const prevBottom = prevY + box.h;
      const nextBottom = nextY + box.h;
      if (prevBottom <= s.y && nextBottom >= s.y) {
        if (s.y < bestTop) {
          bestTop = s.y;
          collided = true;
        }
      }
    }
    if (collided) {
      resolvedY = bestTop - box.h;
      hitDown = true;
    }
  } else {
    // Moving up: look for the first solid whose bottom the box crosses.
    let bestBottom = Number.NEGATIVE_INFINITY;
    let collided = false;
    for (const s of solids) {
      if (box.x + box.w <= s.x || box.x >= s.x + s.w) continue;
      const prevTop = prevY;
      const nextTop = nextY;
      if (prevTop >= s.y + s.h && nextTop <= s.y + s.h) {
        if (s.y + s.h > bestBottom) {
          bestBottom = s.y + s.h;
          collided = true;
        }
      }
    }
    if (collided) {
      resolvedY = bestBottom;
      hitUp = true;
    }
  }

  return { y: resolvedY, hitDown, hitUp };
}

/**
 * Resolve horizontal movement. The player always moves right, so we only need
 * to stop the box from entering a vertical wall from the left. Returns the
 * resolved X and whether a left-facing wall was hit.
 */
export function sweepHorizontal(
  box: Rect,
  prevX: number,
  nextX: number,
  solids: ReadonlyArray<RectangleData>,
): { x: number; hitWall: boolean } {
  const dx = nextX - prevX;
  if (dx === 0) return { x: nextX, hitWall: false };

  let resolvedX = nextX;
  let hitWall = false;

  if (dx > 0) {
    let bestLeft = Number.POSITIVE_INFINITY;
    let collided = false;
    for (const s of solids) {
      if (box.y + box.h <= s.y || box.y >= s.y + s.h) continue;
      const prevRight = prevX + box.w;
      const nextRight = nextX + box.w;
      if (prevRight <= s.x && nextRight >= s.x) {
        if (s.x < bestLeft) {
          bestLeft = s.x;
          collided = true;
        }
      }
    }
    if (collided) {
      resolvedX = bestLeft - box.w;
      hitWall = true;
    }
  }

  return { x: resolvedX, hitWall };
}

/** True if `point` lies inside (or on the boundary of) `rect`. */
export function pointInRect(px: number, py: number, rect: Rect): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.w &&
    py >= rect.y &&
    py <= rect.y + rect.h
  );
}
