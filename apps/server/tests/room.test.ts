import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { GravitySimulation } from "@jinshi-gravity/shared";
import appConfig from "../src/app.config.js";
import { GravityRoom } from "../src/rooms/GravityRoom.js";

let server: ColyseusTestServer;

beforeAll(async () => {
  server = await boot(appConfig, 2658);
  await new Promise((r) => setTimeout(r, 150));
}, 30_000);

afterAll(async () => {
  await server?.shutdown();
}, 30_000);

function makeClientOptions(idx: number): { playerId: string; displayName: string } {
  return { playerId: `local-${idx}`, displayName: `Player ${idx + 1}` };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 4000,
  intervalMs = 25,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

function roomState(room: GravityRoom): any {
  return room.state as any;
}

describe("GravityRoom integration", () => {
  it("assigns the first player as host and starts in LOBBY", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const conn = await server.connectTo(room, makeClientOptions(0));
    await waitFor(() => roomState(room).players.size === 1);
    expect(roomState(room).hostId).toBe("local-0");
    expect(roomState(room).phase).toBe("LOBBY");
    expect(roomState(room).players.get("local-0").isHost).toBe(true);
    await conn.leave();
  }, 15000);

it("rejects attempts to start with too few ready players", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const c1 = await server.connectTo(room, makeClientOptions(0));
    const errors: { code: string }[] = [];
    c1.onMessage("error", (m: { code: string }) => errors.push(m));
    c1.send("start-round", {});
    await waitFor(() => errors.length > 0);
    expect(errors[0]!.code).toMatch(/too-few|not-ready/);
    await c1.leave();
  }, 15000);

  it("requires at least minPlayers ready before running", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const c1 = await server.connectTo(room, makeClientOptions(0));
    const c2 = await server.connectTo(room, makeClientOptions(1));
    const errors: { code: string }[] = [];
    c1.onMessage("error", (m: { code: string }) => errors.push(m));
    await waitFor(() => roomState(room).players.size === 2);
    c1.send("start-round", {});
    await waitFor(() => errors.length > 0);
    expect(errors[0]!.code).toBe("not-ready");
    c1.send("set-ready", { ready: true });
    c2.send("set-ready", { ready: true });
    await waitFor(() =>
      [...roomState(room).players.values()].every((p: any) => p.ready),
    );
    errors.length = 0;
    c1.send("start-round", {});
    await waitFor(() => roomState(room).phase === "COUNTDOWN");
    await c1.leave();
    await c2.leave();
  }, 20000);

  it("transitions countdown -> running and broadcasts round-started", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const c1 = await server.connectTo(room, makeClientOptions(0));
    const c2 = await server.connectTo(room, makeClientOptions(1));
    const roundStarts: { mapId: string }[] = [];
    c1.onMessage("round-started", (m: { mapId: string }) => roundStarts.push(m));
    c1.send("set-ready", { ready: true });
    c2.send("set-ready", { ready: true });
    await waitFor(() =>
      [...roomState(room).players.values()].every((p: any) => p.ready),
    );
    c1.send("start-round", {});
    await waitFor(() => roomState(room).phase === "RUNNING", 6000);
    expect(roundStarts.length).toBeGreaterThan(0);
    await c1.leave();
    await c2.leave();
  }, 25000);

  it("enforces a maximum of eight active players", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const conns: Awaited<ReturnType<typeof server.connectTo>>[] = [];
    for (let i = 0; i < 8; i++) {
      conns.push(await server.connectTo(room, makeClientOptions(i)));
    }
    await waitFor(() => roomState(room).players.size === 8);
    let ninthThrew = false;
    try {
      await server.connectTo(room, makeClientOptions(8));
    } catch {
      ninthThrew = true;
    }
    expect(ninthThrew).toBe(true);
    for (const c of conns) await c.leave();
  }, 25000);

  it("ignores gravity-switch inputs during lobby without moving the player", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const c1 = await server.connectTo(room, makeClientOptions(0));
    c1.send("gravity-switch", { sequence: 1, clientTime: Date.now() });
    await new Promise((r) => setTimeout(r, 200));
    expect(roomState(room).players.get("local-0").x).toBe(0);
    await c1.leave();
  }, 10000);

  it("rejects duplicate input sequence numbers during running", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const c1 = await server.connectTo(room, makeClientOptions(0));
    const c2 = await server.connectTo(room, makeClientOptions(1));
    const errors: { code: string }[] = [];
    const roundStarts: { mapId: string }[] = [];
    c1.onMessage("error", (m: { code: string }) => errors.push(m));
    c1.onMessage("round-started", (m: { mapId: string }) => roundStarts.push(m));
    c1.send("set-ready", { ready: true });
    c2.send("set-ready", { ready: true });
    await waitFor(() =>
      [...roomState(room).players.values()].every((p: any) => p.ready),
    );
    c1.send("start-round", {});
    await waitFor(() => roundStarts.length > 0, 6000);
    c1.send("gravity-switch", { sequence: 5, clientTime: 1 });
    await waitFor(
      () =>
        (room as unknown as { sim?: GravitySimulation | null }).sim?.getPlayer("local-0")
          ?.inputSequence === 5,
      4000,
    );
    c1.send("gravity-switch", { sequence: 5, clientTime: 2 });
    await waitFor(() => errors.length > 0, 4000);
    expect(errors.some((e) => e.code === "duplicate-sequence")).toBe(true);
    await c1.leave();
    await c2.leave();
  }, 25000);

  it("makes late joiners spectators once RUNNING", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const c1 = await server.connectTo(room, makeClientOptions(0));
    const c2 = await server.connectTo(room, makeClientOptions(1));
    c1.send("set-ready", { ready: true });
    c2.send("set-ready", { ready: true });
    await waitFor(() =>
      [...roomState(room).players.values()].every((p: any) => p.ready),
    );
    c1.send("start-round", {});
    await waitFor(() => roomState(room).phase === "RUNNING", 6000);
    const c3 = await server.connectTo(room, makeClientOptions(2));
    await waitFor(() => roomState(room).players.get("local-2") !== undefined);
    const seat = roomState(room).players.get("local-2");
    expect(seat.spectator).toBe(true);
    expect(seat.alive).toBe(false);
    await c1.leave();
    await c2.leave();
    await c3.leave();
  }, 25000);

  it("eliminates players that hit a hazard and broadcasts the death", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "practice" });
    const c1 = await server.connectTo(room, makeClientOptions(0));
    const eliminations: { playerId: string; cause: string }[] = [];
    const roundStarts: { mapId: string }[] = [];
    c1.onMessage("eliminated", (m) => eliminations.push(m));
    c1.onMessage("round-started", (m: { mapId: string }) => roundStarts.push(m));
    await waitFor(() => roundStarts.length > 0, 8000);
    await new Promise((r) => setTimeout(r, 200));
    const sim = (room as unknown as { sim: GravitySimulation | null }).sim;
    expect(sim).toBeDefined();
    const p = sim?.getPlayer("local-0");
    expect(p).toBeDefined();
    if (p) {
      p.x = 3380;
      p.y = 524;
    }
    await waitFor(() => eliminations.length > 0, 8000);
    expect(eliminations.length).toBeGreaterThan(0);
    expect(roomState(room).players.get("local-0").alive).toBe(false);
    await c1.leave();
  }, 25000);

  it("rematch: votes by all seated players return the room to LOBBY", async () => {
    const room = await server.createRoom<GravityRoom>("gravity", { mode: "multiplayer" });
    const c1 = await server.connectTo(room, makeClientOptions(0));
    const c2 = await server.connectTo(room, makeClientOptions(1));
    c1.send("set-ready", { ready: true });
    c2.send("set-ready", { ready: true });
    await waitFor(() =>
      [...roomState(room).players.values()].every((p: any) => p.ready),
    );
    c1.send("start-round", {});
    await waitFor(() => roomState(room).phase === "RUNNING", 6000);
    (room as unknown as { endRound: () => void }).endRound();
    await waitFor(() => roomState(room).phase === "FINISHED");
    c1.send("vote-rematch", { rematch: true });
    c2.send("vote-rematch", { rematch: true });
    await waitFor(() => roomState(room).phase === "LOBBY", 4000);
    expect(roomState(room).rematchVoters.length).toBe(0);
    await c1.leave();
    await c2.leave();
  }, 25000);
});

// Silence unused import warnings while keeping the typing useful.
export type OptionalClient = undefined;