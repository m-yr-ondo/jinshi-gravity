import { describe, expect, it } from "vitest";
import type { PlayerRuntimeState } from "@jinshi-gravity/shared";
import { computeMatchResult } from "../src/winner.js";

function stateLike(over: Partial<PlayerRuntimeState>): PlayerRuntimeState {
  return {
    playerId: over.playerId ?? "p",
    displayName: over.displayName ?? "P",
    color: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravityDir: 1,
    grounded: false,
    alive: over.alive ?? true,
    finished: over.finished ?? false,
    finishTimeMs: over.finishTimeMs ?? 0,
    progress: over.progress ?? 0,
    inputSequence: 0,
    lastInputMs: 0,
    eliminatedAtMs: over.eliminatedAtMs ?? null,
    survivalMs: over.survivalMs ?? 0,
    ready: false,
    isHost: false,
    connected: true,
  };
}

const base = {
  gameId: "g-1",
  roomId: "r-1",
  mapId: "training-run",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:30.000Z",
};

describe("computeMatchResult - winner selection", () => {
  it("ranks finishers by finish time ascending", () => {
    const r = computeMatchResult(
      [
        stateLike({ playerId: "a", finished: true, finishTimeMs: 12000, progress: 9000 }),
        stateLike({ playerId: "b", finished: true, finishTimeMs: 9000, progress: 9000 }),
      ],
      base,
    );
    expect(r.reason).toBe("finish");
    expect(r.winnerId).toBe("b");
    expect(r.placements.map((p) => p.playerId)).toEqual(["b", "a"]);
  });

  it("uses last-survivor reason when nobody finished but one alive", () => {
    const r = computeMatchResult(
      [
        stateLike({ playerId: "a", alive: false, progress: 5000, survivalMs: 4000 }),
        stateLike({ playerId: "b", alive: true, progress: 6000, survivalMs: 5000 }),
      ],
      base,
    );
    expect(r.reason).toBe("last-survivor");
    expect(r.winnerId).toBe("b");
  });

  it("uses all-eliminated reason when everyone is dead with no finishers", () => {
    const r = computeMatchResult(
      [
        stateLike({ playerId: "a", alive: false, progress: 5000, survivalMs: 4000 }),
        stateLike({ playerId: "b", alive: false, progress: 5500, survivalMs: 3000 }),
      ],
      base,
    );
    expect(r.reason).toBe("all-eliminated");
    expect(r.winnerId).toBe("b");
  });

  it("resolves simultaneous-death tie: highest progress wins, then survival", () => {
    const r = computeMatchResult(
      [
        stateLike({ playerId: "a", alive: false, progress: 5500, survivalMs: 4000 }),
        stateLike({ playerId: "b", alive: false, progress: 5500, survivalMs: 5000 }),
      ],
      base,
    );
    expect(r.winnerId).toBe("b");
  });

  it("declares a draw when progress and survival are equal", () => {
    const r = computeMatchResult(
      [
        stateLike({ playerId: "a", alive: false, progress: 5500, survivalMs: 4000 }),
        stateLike({ playerId: "b", alive: false, progress: 5500, survivalMs: 4000 }),
      ],
      base,
    );
    expect(r.reason).toBe("draw");
    expect(r.winnerId).toBeUndefined();
    expect(r.placements[0]!.placement).toBe(1);
    expect(r.placements[1]!.placement).toBe(2); // stable iteration order
  });

  it("ranks survivors above the eliminated, sorted by progress", () => {
    const r = computeMatchResult(
      [
        stateLike({ playerId: "a", finished: true, finishTimeMs: 12000, progress: 9000 }),
        stateLike({ playerId: "b", alive: true, progress: 7000, survivalMs: 9000 }),
        stateLike({ playerId: "c", alive: true, progress: 7500, survivalMs: 9000 }),
        stateLike({ playerId: "d", alive: false, progress: 6000, survivalMs: 3000 }),
      ],
      base,
    );
    expect(r.placements.map((p) => p.playerId)).toEqual(["a", "c", "b", "d"]);
  });

  it("winnerId omitted only on a strict draw at placement 1", () => {
    const r = computeMatchResult(
      [
        stateLike({ playerId: "a", finished: true, finishTimeMs: 12000, progress: 9000 }),
        stateLike({ playerId: "b", finished: true, finishTimeMs: 12000, progress: 9000 }),
      ],
      base,
    );
    // Equal finish time AND progress => still keeps winnerId? They both finished;
    // finishers are ordered by finish time ascending and ties remain stable. With
    // identical progress+survival, the rule flips to draw only when both are not
    // finished (all-eliminated path). Here finished ties keep reason "finish" but
    // winnerId resolves to the first finisher in stable order.
    expect(r.reason).toBe("finish");
    expect(r.winnerId).toBe("a");
  });

  it("records full finishing order in placements", () => {
    const r = computeMatchResult(
      Array.from({ length: 5 }, (_, i) =>
        stateLike({
          playerId: `p${i}`,
          finished: true,
          finishTimeMs: 10000 + i * 500,
          progress: 9000,
        }),
      ),
      base,
    );
    expect(r.placements.length).toBe(5);
    expect(r.placements.map((p) => p.playerId)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(r.placements.map((p) => p.placement)).toEqual([1, 2, 3, 4, 5]);
  });
});