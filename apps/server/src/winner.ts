import type { PlayerRuntimeState } from "@jinshi-gravity/shared";
import type { GravityMatchResult, GravityMatchResultPlacement } from "@jinshi-gravity/shared";

/** Snapshot used internally during placement computation. */
interface Ranker {
  playerId: string;
  displayName: string;
  finished: boolean;
  eliminated: boolean;
  finishTimeMs: number;
  progress: number;
  survivalMs: number;
  alive: boolean;
}

/**
 * Decide a deterministic placement order for every player in the simulation,
 * then map the result into the future-facing GravityMatchResult type.
 *
 * Winner-selection rules (server-authoritative):
 *  1. Players who crossed the finish line are ordered by finish time ascending.
 *  2. Players who survived but did not finish rank immediately after finishers,
 *     ordered by greatest horizontal progress, then survival time.
 *  3. Dead players rank after survivors, also ordered by progress then
 *     survival time (so simultaneous deaths in the same tick tie-break fairly).
 *  4. Reason:
 *     - "finish": at least one player crossed the finish line.
 *     - "last-survivor": no finishers but at least one alive survivor.
 *     - "all-eliminated": everyone was eliminated by hazards / out-of-bounds.
 *     - "draw": placement 1 is unbreakable (equal progress AND survival).
 */
export function computeMatchResult(
  players: Iterable<PlayerRuntimeState>,
  opts: { gameId: string; roomId: string; mapId: string; startedAt: string; endedAt: string },
): GravityMatchResult {
  const rankers: Ranker[] = [];
  for (const p of players) {
    rankers.push({
      playerId: p.playerId,
      displayName: p.displayName,
      finished: p.finished,
      eliminated: !p.alive && !p.finished,
      finishTimeMs: p.finishTimeMs,
      progress: p.progress,
      survivalMs: p.survivalMs,
      alive: p.alive,
    });
  }

  // Sort: finishers first (by finish time), then alive survivors (by progress),
  // then eliminated (by progress then survival). Ties within the same group
  // remain stable because Array.prototype.sort is stable in modern V8.
  rankers.sort((a, b) => {
    if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.alive && !b.alive) return -1;
    if (!a.alive && b.alive) return 1;
    // Both finished or both not finished / both alive or both dead:
    if (a.progress !== b.progress) return b.progress - a.progress;
    return b.survivalMs - a.survivalMs;
  });

  const placements: GravityMatchResultPlacement[] = rankers.map((r, i) => ({
    playerId: r.playerId,
    displayName: r.displayName,
    placement: i + 1,
    finished: r.finished,
    eliminated: r.eliminated,
    progress: r.progress,
    survivalMs: r.survivalMs,
  }));

  const anyFinished = placements.some((p) => p.finished);
  const anyAlive = rankers.some((r) => r.alive);
  const allDead = !anyFinished && !anyAlive;

  let reason: GravityMatchResult["reason"];
  if (anyFinished) reason = "finish";
  else if (anyAlive && !allDead) reason = "last-survivor";
  else reason = "all-eliminated";

  let winnerId: string | undefined;
  if (placements.length >= 1) {
    const first = placements[0]!;
    const second = placements[1];
    // The progress+survival tiebreaker only applies to the all-eliminated
    // scenario per spec. Otherwise, the first placement (first finisher or
    // sole survivor) is the winner in stable iteration order.
    if (
      reason === "all-eliminated" &&
      second &&
      first.progress === second.progress &&
      first.survivalMs === second.survivalMs
    ) {
      reason = "draw";
      winnerId = undefined;
    } else {
      winnerId = first.playerId;
    }
  }

  return {
    gameId: opts.gameId,
    roomId: opts.roomId,
    mapId: opts.mapId,
    reason,
    startedAt: opts.startedAt,
    endedAt: opts.endedAt,
    placements,
    winnerId,
  };
}