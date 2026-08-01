# Jinshi Gravity

A local-multiplayer, one-button gravity-switch racing web game. Server
authoritative via Colyseus + Phaser 3 client. **This is the standalone
local-only phase**: no Discord, no Jinshi bot, no database, no economy. The
game is entirely original; no G-Switch assets, code, levels or branding are
included.

The future path to a Discord Activity integration with the Jinshi bot is
described in [`docs/FUTURE_INTEGRATION.md`](docs/FUTURE_INTEGRATION.md). The
full game rules, physics and collision model live in
[`docs/GAME_SPEC.md`](docs/GAME_SPEC.md).

---

## Architecture

```
jinshi-gravity/
├── apps/
│   ├── client/   Vite + Phaser 3 + Colyseus SDK browser client
│   └── server/   Colyseus server (authoritative simulation + rooms)
├── packages/
│   └── shared/   Pure TypeScript: simulation, maps, protocol, types, results
├── docs/         GAME_SPEC.md, FUTURE_INTEGRATION.md
└── (root)        npm workspaces, shared tsconfig
```

The authoritative simulation lives in `packages/shared/src/simulation`. The
server drives it with fixed 60 Hz ticks. The client only renders a
projection of the replicated state; gameplay inputs are 1-bit gravity-switch
intentions only.

## Requirements

- **Node.js 20+**
- A modern desktop browser (Chromium, Firefox, Edge). Mobile is intentionally
  out of scope.
- No external services or databases are required for local play.

## Installation

```bash
git clone <this repo> jinshi-gravity
cd jinshi-gravity
npm install
```

This installs every workspace (`apps/client`, `apps/server`,
`packages/shared`) at once.

## Environment variables

Copy `.env.example` to `apps/server/.env` if you want to override defaults.

| Variable                     | Default              | Where        |
|------------------------------|----------------------|--------------|
| `GRAVITY_SERVER_PORT`        | `2568`               | server entry |
| `VITE_GRAVITY_SERVER_URL`    | `ws://localhost:2568`| client Vite  |
| `VITE_AUDIO_MUTED`           | `false`              | client       |
| `VITE_PORT`                  | `5175`               | client Vite  |

The chosen ports intentionally do not collide with Jinshi Checkers (server
2567, client 5173) so both projects can run at the same time.

## Local startup

Start both client and server in one terminal:

```bash
npm run dev
```

Or separately:

```bash
npm run dev:server   # Colyseus server on http://localhost:2568
npm run dev:client   # Vite dev server on http://localhost:5175
```

Open **http://localhost:5175** in your desktop browser.

### Build and verify

```bash
npm run build           # builds shared -> server -> client
npm run typecheck       # typechecks server and client (shared already built)
npm run test            # builds shared then runs shared + server vitest suites
```

## Testing

| Script                   | What it runs                                                                 |
|--------------------------|------------------------------------------------------------------------------|
| `npm run test`           | Builds `@jinshi-gravity/shared` and runs `vitest run` in shared + server     |
| `npm run typecheck`      | `tsc --noEmit` in shared (via build), server and client                      |
| `npm run build`          | Production build of shared, server (`tsc`) and client (`vite build`)         |

`packages/shared/tests/simulation.test.ts` covers downward/upward gravity,
gravity inversion, input cooldown, landing on floor and ceiling, gaps,
hazard collision, finish detection, world-boundary death, increasing
horizontal speed, deterministic results from identical input sequences, and
map validation for both built-ins and rejection cases.

`apps/server/tests/winner.test.ts` covers first-finisher ranking,
last-survivor, all-eliminated, simultaneous-death tiebreaking and draws.

`apps/server/tests/room.test.ts` boots a real Colyseus test server
(`@colyseus/testing`) and verifies: host designation, maximum-eight active
players, minimum-two ready requirement, ready-state requirement,
countdown → RUNNING transitions, late-joiner spectating, hazard-driven
elimination, duplicate-input rejection, and rematch flow back to LOBBY.

## Two-tab multiplayer test

1. Run `npm run dev` and open `http://localhost:5175` in tab A.
2. Enter a name in **Display name**, choose **Training Run** and click
   **Create room**. The room code (e.g. `ABCD`) is shown.
3. Open `http://localhost:5175` in tab B. Type the same display name and
   the room code in **Room code**, then **Join**.
4. Both players click **Mark ready**.
5. Tab A's host clicks **Start round**. The 3-second countdown appears in
   both tabs; RUNNING begins. Use Space, ↑, or left-click to switch gravity.
6. To scale up: open additional tabs and **Join** with the same code, up to 8
   total players. Each plain browser tab automatically gets its own independent
   player identity (per-tab `sessionStorage`), so no incognito / private window
   is needed.

## Controls

| Input         | Action                |
|---------------|-----------------------|
| `Space`       | Reverse gravity (jump)|
| `Up` arrow    | Reverse gravity       |
| Left click    | Reverse gravity       |
| `M` toggle 🔊 | Mute / unmute audio   |

Key-repeat events are ignored so holding the key never spams switches.

## Levels

| id              | Name           | Notes |
|-----------------|----------------|-------|
| `training-run`  | Training Run   | Easy intro; wide platforms; clear switch points |
| `split-circuit` | Split Circuit  | Alternating ceiling/floor with gaps + hazards |
| `velocity-core` | Velocity Core  | Tight reaction windows; faster pacing; weave-heavy |

All maps are data-driven (see `packages/shared/src/maps`).

## Troubleshooting

| Symptom                              | Fix |
|--------------------------------------|-----|
| Browser can't connect to server      | Make sure `npm run dev:server` is running and `GRAVITY_SERVER_PORT` matches the client `VITE_GRAVITY_SERVER_URL`. The default ports are intentionally not 2567/5173. |
| Loud `WebSocket failed` in console    | Restart `npm run dev:server` and refresh the client. Mirrors are normal during hot reload of Colyseus. |
| Player not moving at start           | The server requires both players to be ready. Hit **Mark ready** on both tabs. |
| Refresh-and-reconnect               | Reopen the same tab within 15s. Your seat is reserved by stable local `playerId`. |
| Sound never plays                   | Click anywhere first; browser autoplay requires a user gesture. The 🔇 button toggles audio. |
| No webhook to Discord               | Expected — Discord integration is out of scope (see `docs/FUTURE_INTEGRATION.md`). |

## Known limitations

- Solo practice requires a single tab in `mode: "practice"` room; no AI
  opponents.
- `crush` death cause is wired but not separately modeled yet; high-speed
  penetration is handled by snapping the player to the nearest free surface.
- Mobile control layouts are intentionally not optimized; desktop only.
- Result type (`GravityMatchResult`) is built on the server and validated in
  tests but never sent anywhere — no `/internal/gravity-result` request
  exists yet.

## Asset licenses

All assets shipped in this project are **original and procedurally
generated**:

- **Audio** (`apps/client/src/util/audio.ts`): tiny WebAudio oscillator
  synthesis. No third-party sound files. No copyrighted work included.
- **Graphics**: solid filled rectangles / triangles / text rendered
  procedurally via Phaser primitives with the neon palette defined in
  `apps/client/src/styles.css`. No image files.
- **Runner sprite** (`apps/client/public/sprites/runner/runner-sheet.png`):
  Kenney's Pixel Platformer pack, CC0. Credit: Kenney (kenney.nl).
- **Fonts**: system stack (`Segoe UI`, `system-ui`, `Trebuchet MS`).
- **Code**: this repository's MIT license covers everything.

If a future revision adds third-party tile-sets or music, the manifest must
be recorded in `docs/asset-licenses.md` before commit.

## License

MIT — see [`LICENSE`](LICENSE) once committed.
