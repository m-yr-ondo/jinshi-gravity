# Jinshi Gravity — Game Specification

This document specifies the full game rules, the authoritative physics model,
collision behaviour, the winner-selection algorithm, the on-disk map format,
and the network authority boundary.

Jinshi Gravity is an original local-multiplayer web game inspired by the
one-button gravity-switch racing genre. It is **not** derived from G-Switch and
ships zero G-Switch assets, code, levels, names or branding.

## 1. Game loop

A round flows through four server-authoritative phases:

```
LOBBY ── host starts (>=2 ready) ──▶ COUNTDOWN (3s) ──▶ RUNNING ──▶ FINISHED
   ▲                                                                   │
   └─────────────────────── rematch vote ──────────────────────────────┘
```

- `LOBBY`: players join, pick display names, mark ready, host selects a level.
- `COUNTDOWN`: 3-second fixed countdown. Players cannot move yet.
- `RUNNING`: simulation ticks at 60 Hz on the server. Players race, switch
  gravity and either finish or die.
- `FINISHED`: leaderboard and full placements ship to clients. Players vote
  rematch; meeting the vote threshold returns to `LOBBY`.

Practice mode skips the lobby threshold and starts a single-player race on
join. Late joiners during `RUNNING` become spectators until the next round.

## 2. Players

- Supports 2-8 players in multiplayer; 1 player in solo practice.
- Players never collide with each other. Everyone races the same course.
- Display names and color are visible in the lobby, HUD and results.
- Each browser tab generates a stable local `playerId` stored in
  `localStorage` (see `apps/client/src/util/storage.ts`). Local IDs are **not**
  secure Discord identities; they exist purely for local reconnection.

## 3. Movement and physics

Players auto-run horizontally to the right. The only player action is
reversing gravity. Inputs come from Space, Up arrow or left mouse click;
key-repeat events are ignored.

The authoritative simulation runs in pure TypeScript in
`packages/shared/src/simulation/GravitySimulation.ts` using a fixed 60 Hz
timestep. Wall-clock frame duration never affects physics. All movement
constants live in `packages/shared/src/config/sim-config.ts`:

| Constant                | Default | Notes |
|-------------------------|---------|-------|
| Tick rate               | 60 Hz   | derived `dt = 1/60` |
| Initial run speed       | 280 u/s | `initialRunSpeed` |
| Max run speed           | 420 u/s | `maxRunSpeed` |
| Speed ramp              | 6 u/s²  | `speedRampPerSec` (linear until ceiling) |
| Gravity magnitude       | 1600 u/s² | `gravityMagnitude` |
| Switch vertical speed   | 420 u/s | `switchVerticalSpeed` applied instantly |
| Max vertical speed      | 700 u/s | `maxVerticalSpeed` |
| Player box              | 28 × 36 u | `playerWidth` / `playerHeight` |
| Input cooldown          | 80 ms   | `inputCooldownMs` |
| Finish line thickness   | 12 u    | `finishLineThickness` |
| Fall-behind limit       | 1400 u  | `fallBehindLimit` behind the race leader |
| Reconnect grace         | 15000 ms | `reconnectGraceMs` |
| Broadcast rate          | 20 Hz   | state snapshots per second |
| Countdown duration      | 3000 ms | `countdownMs` |
| Min players (multi)      | 2       | `minPlayers` |
| Max players             | 8       | `maxPlayers` |

When the player triggers a gravity switch:

```
gravityDirection *= -1
verticalVelocity = gravityDirection * switchVerticalSpeed
grounded = false
```

The server then integrates vertical velocity under gravity every tick. The
result is deterministic given identical config and identical input sequences
(see `tests/simulation.test.ts` → "is deterministic").

## 4. Collisions

All collision shapes are axis-aligned rectangles (AABBs).

- **Solids** are platform rectangles that act as floors or ceilings. A player
  landing on a floor or ceiling stops their vertical velocity and becomes
  grounded. A player can run on either side of a platform.
- **Hazards** are static lethal rectangles. Touching any of them kills the
  player.
- **Gaps** are stretches without floor or ceiling; players fall through and
  either die in the world boundary or land on a later platform.
- **Finish zone** is a vertical sensor at `map.finishX`. Crossing it (player
  right edge >= finishX) marks the player finished and records `finishTimeMs`.
- **World boundary**: players leaving `<0` (top) or `>height` (bottom) die
  with `out-of-bounds`.
- **Crush**: not separately modeled in v1; the swept collision resolver
  refuses penetration by snapping the player to the nearest free surface.

The simulation uses swept-AABB resolution in
`packages/shared/src/simulation/collision.ts` per dimension. Sweeping matters
because players can reach 700 u/s vertically; thin platforms could otherwise be
tunneled at high speed.

### Death causes

A player is eliminated when:

1. They touch a hazard → `hazard`.
2. They exit the vertical world bounds → `out-of-bounds`.
3. They fall `fallBehindLimit` (1400 u) behind the race leader → `fell-behind`.
4. They disconnect and the reconnection grace expires → `disconnected`.
5. (Future) Crushing / invalid collision state → `crush`.

## 5. Round end and winner selection

The server ends the round when:

- `activeRacerCount == 0` (everyone finished or died), or
- the round is **multiplayer**, no one has finished, and exactly one racer
  remains alive (the lone survivor wins by the last-survivor rule).

In solo practice the only player can never "trigger" the lone-survivor rule,
so they keep racing until they finish or die.

The result is built by `computeMatchResult` in
`apps/server/src/winner.ts`. Ordering rules:

1. **Finishers first**, ordered by `finishTimeMs` ascending.
2. **Alive survivors** (no finishers but alive at end), ordered by greatest
   progress, then greatest survival time.
3. **Eliminated players**, ordered by greatest progress, then greatest survival
   time, so simultaneous deaths in the same tick tie-break fairly.

`reason` mapping:

- `finish`: at least one player finished.
- `last-survivor`: no finishers but at least one alive survivor.
- `all-eliminated`: everyone died and no finishers.
- `draw`: placement 1 is unbreakable (equal progress AND equal survival time).

The full finishing order is stored, not just the winner. The server, never
the client, decides the outcome.

## 6. Maps

Maps are data-driven, defined in `packages/shared/src/maps/*.ts` and shipped
through `packages/shared` so the server and client load the identical data.
Maps are never hard-coded into Phaser scenes.

```ts
interface GameMap {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  finishX: number;
  solids: RectangleData[];
  hazards: RectangleData[];
  decorations?: DecorationData[];
  targetSeconds: number;
}
```

### Shipped maps

| id              | Name           | Difficulty | Approx clear time |
|-----------------|----------------|------------|-------------------|
| `training-run`  | Training Run   | Easy       | 20-30 s           |
| `split-circuit` | Split Circuit  | Medium     | 30-45 s           |
| `velocity-core` | Velocity Core  | Hard       | 40-60 s           |

### Validation

`validateMap` / `validateMaps` in
`packages/shared/src/maps/validateMap.ts` reject:

- duplicate map ids in a collection,
- rectangles that are not finite, or with `w <= 0` / `h <= 0`,
- rectangles that extend outside the map's bounds,
- a `finishX` outside the map width or behind the spawn,
- spawn points that overlap any hazard,
- missing required fields (`id`, `name`, `description`, `width`, `height`,
  `spawn`, `finishX`, `solids`, `hazards`, `targetSeconds`).

The shared package validates all built-in maps at import time.

## 7. Network authority boundary

The Colyseus server (`apps/server/src/rooms/GravityRoom.ts`) is authoritative
for:

- player positions, velocities and gravity direction,
- collision outcomes, deaths and `tick` events,
- countdown state, round phase, finish order and winner,
- rematch tally.

The client sends only **intentions**:

```ts
{ type: "gravity-switch", sequence: 17, clientTime: 123456 }
```

The server validates each input:

- sequence numbers must strictly increase,
- duplicate sequences are rejected,
- the input cooldown must have elapsed since the previous accepted input,
- gameplay inputs are rejected unless the phase is `RUNNING`,
- spectators and dead players cannot send inputs,
- clients are never trusted to supply position, velocity, scores or winners.

Server state is replicated to clients via `@colyseus/schema` at 20 Hz. The
client immediately echoes its own switch intent in the local display for
responsiveness, while relying on the server broadcast to drive the truth.
Other players are interpolated; the local player's horizontal position is
extrapolated briefly between server updates using its authoritative vx; the
server discards/blocks any input that disagrees and the client snaps to the
authoritative state on the next state patch.

Reconnection grace: when a client drops during `RUNNING` the seat is
reserved for 15 seconds. The same stable local `playerId` re-entering the
room within that period resumes the existing seat. After grace expires the
seat is eliminated with cause `disconnected`. Late joiners during `RUNNING`
are placed into a spectator seat until the next round.

## 8. Future-facing result type

The shared package exposes:

```ts
interface GravityMatchResult {
  gameId: string; roomId: string; mapId: string;
  reason: "finish" | "last-survivor" | "all-eliminated" | "draw";
  startedAt: string; endedAt: string;
  placements: Array<{ playerId: string; displayName: string;
    placement: number; finished: boolean; eliminated: boolean;
    progress: number; survivalMs: number; }>;
  winnerId?: string;
}
```

In the current phase the result is constructed and logged on the server but
**not sent anywhere**. `docs/FUTURE_INTEGRATION.md` describes how it would be
translated into a Jinshi internal API request in a later phase.