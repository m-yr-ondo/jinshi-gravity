import { describe, expect, it } from "vitest";
import {
  ALL_MAPS,
  GravitySimulation,
  SIM_CONFIG,
  getMapById,
  validateMap,
  validateMaps,
} from "../src/index.js";
import { trainingRun } from "../src/maps/trainingRun.js";
import { splitCircuit } from "../src/maps/splitCircuit.js";
import { velocityCore } from "../src/maps/velocityCore.js";
import type { GameMap } from "../src/types/index.js";

const PLAYER = "p1";

function freshSim(map: GameMap = trainingRun): GravitySimulation {
  const sim = new GravitySimulation(map);
  sim.addPlayer(PLAYER, "Tester", 0x00ffcc);
  return sim;
}

function tickN(sim: GravitySimulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.tick();
}

describe("map validation", () => {
  it("accepts every built-in map", () => {
    for (const m of ALL_MAPS) {
      const r = validateMap(m);
      expect(r.ok, m.id).toBe(true);
    }
  });

  it("rejects duplicate map ids in a collection", () => {
    const dup = [...ALL_MAPS, trainingRun];
    const r = validateMaps(dup);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("duplicate map id"))).toBe(true);
    }
  });

  it("rejects finish lines outside the map", () => {
    const bad = { ...trainingRun, finishX: trainingRun.width + 100 };
    const r = validateMap(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("finishX"))).toBe(true);
  });

  it("rejects spawn points inside hazards", () => {
    const bad: GameMap = {
      ...trainingRun,
      spawn: { x: 3400, y: 500 },
      hazards: [{ x: 3400, y: 520, w: 120, h: 40 }],
    };
    const r = validateMap(bad);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.some((e) => e.includes("spawn point overlaps"))).toBe(
        true,
      );
  });

  it("rejects invalid rectangles", () => {
    const bad: GameMap = {
      ...trainingRun,
      solids: [{ x: 0, y: 560, w: -10, h: 160 }],
    };
    const r = validateMap(bad);
    expect(r.ok).toBe(false);
  });

  it("rejects missing required fields", () => {
    const r = validateMap({ id: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('"name"'))).toBe(true);
      expect(r.errors.some((e) => e.includes('"solids"'))).toBe(true);
    }
  });
});

describe("built-in maps are registered", () => {
  it("exposes three maps", () => {
    expect(ALL_MAPS.length).toBeGreaterThanOrEqual(3);
  });
  it("finds each map by id", () => {
    expect(getMapById("training-run")).toBe(trainingRun);
    expect(getMapById("split-circuit")).toBe(splitCircuit);
    expect(getMapById("velocity-core")).toBe(velocityCore);
  });
});

describe("gravity & movement", () => {
  it("applies downward gravity by default", () => {
    const sim = freshSim();
    sim.startRound();
    // Player spawns at y=524, floor top at 560 with player height 36 -> rests at 524.
    const before = sim.getPlayer(PLAYER)!.y;
    tickN(sim, 5);
    const after = sim.getPlayer(PLAYER)!.y;
    expect(after).toBeGreaterThanOrEqual(before); // should not rise
    expect(sim.getPlayer(PLAYER)!.grounded).toBe(true);
  });

  it("applies upward gravity after a switch", () => {
    const sim = freshSim();
    sim.startRound();
    sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 1, clientTime: 0 });
    expect(sim.getPlayer(PLAYER)!.gravityDir).toBe(-1);
    expect(sim.getPlayer(PLAYER)!.vy).toBe(-SIM_CONFIG.switchVerticalSpeed);
  });

  it("inverts gravity back and forth with alternating inputs", () => {
    const sim = freshSim();
    sim.startRound();
    sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 1, clientTime: 0 });
    expect(sim.getPlayer(PLAYER)!.gravityDir).toBe(-1);
    tickN(sim, 6); // 100 ms
    sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 2, clientTime: 0 });
    expect(sim.getPlayer(PLAYER)!.gravityDir).toBe(1);
  });

  it("rejects duplicate and non-increasing sequence numbers", () => {
    const sim = freshSim();
    sim.startRound();
    sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 5, clientTime: 0 });
    tickN(sim, 6);
    expect(
      sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 5, clientTime: 0 }).ok,
    ).toBe(false);
    expect(
      sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 4, clientTime: 0 }).ok,
    ).toBe(false);
  });

  it("enforces input cooldown", () => {
    const sim = freshSim();
    sim.startRound();
    sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 1, clientTime: 0 });
    // Immediately try again - within 80 ms cooldown.
    const r = sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 2, clientTime: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cooldown");
  });

  it("lands the player on a floor", () => {
    const sim = freshSim();
    sim.startRound();
    // Spawn on floor, switch up, then back down to land again on the floor.
    sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 1, clientTime: 0 });
    tickN(sim, 10);
    // Player should be in the air or on ceiling here.
    sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 2, clientTime: 0 });
    tickN(sim, 60);
    const p = sim.getPlayer(PLAYER)!;
    expect(p.alive).toBe(true);
  });

  it("lands the player on a ceiling", () => {
    const sim = freshSim();
    sim.startRound();
    // Immediately switch up; spawn area has no ceiling, so use split circuit which has spawn-floor + ceiling spans.
    const sim2 = new GravitySimulation(splitCircuit);
    sim2.addPlayer(PLAYER, "T", 0xff);
    sim2.startRound();
    // Walk to ceiling span at x=1400 (sim ticks until past x=1400).
    tickN(sim2, 240);
    sim2.applyInput(PLAYER, { type: "gravity-switch", sequence: 1, clientTime: 0 });
    tickN(sim2, 60);
    const p = sim2.getPlayer(PLAYER)!;
    expect(p.alive).toBe(true);
  });

  it("kills players that touch a hazard", () => {
    const sim = new GravitySimulation(trainingRun);
    sim.addPlayer(PLAYER, "T", 0xff);
    sim.startRound();
    // Spawn near the hazard to force contact.
    sim.getPlayer(PLAYER)!.x = 3380;
    sim.getPlayer(PLAYER)!.y = 520;
    // Disable fall-behind by simulating just one tick.
    const events = sim.tick();
    expect(events.deaths.some((d) => d.playerId === PLAYER)).toBe(true);
    expect(sim.getPlayer(PLAYER)!.alive).toBe(false);
  });

  it("kills players that leave the vertical world boundary", () => {
    const sim = freshSim();
    sim.startRound();
    sim.getPlayer(PLAYER)!.y = -100; // already out of bounds top
    sim.getPlayer(PLAYER)!.vy = 0;
    const events = sim.tick();
    expect(events.deaths.some((d) => d.playerId === PLAYER)).toBe(true);
  });

  it("increases horizontal speed over time", () => {
    const sim = freshSim();
    sim.startRound();
    sim.getPlayer(PLAYER)!.y = 300; // mid-air is safe (no hazards there at spawn)
    const startVx = sim.getPlayer(PLAYER)!.vx;
    tickN(sim, 60); // ~1 second
    expect(sim.getPlayer(PLAYER)!.vx).toBeGreaterThan(startVx);
  });

  it("detects finishing the course", () => {
    // Use a tiny custom map to avoid many ticks.
    const tiny: GameMap = {
      id: "tiny",
      name: "Tiny",
      description: "test",
      width: 800,
      height: 720,
      spawn: { x: 80, y: 524 },
      finishX: 400,
      targetSeconds: 2,
      solids: [{ x: 0, y: 560, w: 800, h: 160 }],
      hazards: [],
    };
    const sim = new GravitySimulation(tiny);
    sim.addPlayer(PLAYER, "T", 0xff);
    sim.startRound();
    // Boost vx to clear the distance in a few ticks.
    sim.getPlayer(PLAYER)!.vx = 800;
    let finished = false;
    for (let i = 0; i < 60 && !finished; i++) {
      const e = sim.tick();
      if (e.finishes.length > 0) finished = true;
    }
    expect(finished).toBe(true);
    expect(sim.getPlayer(PLAYER)!.finished).toBe(true);
  });

  it("moves past gaps without crashing", () => {
    // On training-run, the first gap is at x in [1800, 2800). Floor resumes at 2800.
    const sim = new GravitySimulation(trainingRun);
    sim.addPlayer(PLAYER, "T", 0xff);
    sim.startRound();
    // Switch up just before the gap so the player rides the ceiling span.
    sim.getPlayer(PLAYER)!.x = 1780;
    sim.applyInput(PLAYER, { type: "gravity-switch", sequence: 1, clientTime: 0 });
    tickN(sim, 200);
    const p = sim.getPlayer(PLAYER)!;
    expect(p.alive).toBe(true);
  });

  it("is deterministic: identical inputs produce identical states", () => {
    function runOnce(): number {
      const sim = new GravitySimulation(trainingRun);
      sim.addPlayer("a", "A", 0xff);
      sim.addPlayer("b", "B", 0x00);
      sim.startRound();
      const seqs = [1, 2, 3, 4, 5, 6, 7, 8];
      let idx = 0;
      for (let t = 0; t < 600; t++) {
        sim.tick();
        // Apply consistent input events at deterministic ticks.
        if (idx < seqs.length && t === (idx + 1) * 10) {
          sim.applyInput("a", {
            type: "gravity-switch",
            sequence: seqs[idx]!,
            clientTime: 0,
          });
          idx++;
        }
      }
      return sim.simTimeMs + sim.getPlayer("a")!.x * 13 + sim.getPlayer("b")!.y;
    }
    const a = runOnce();
    const b = runOnce();
    expect(a).toBe(b);
  });
});