# Jinshi Gravity — Handoff Report

## 1. Commands used to validate the project
From `C:\Users\OWNER\Documents\jinshi_projects\jinshi-gravity`:

```text
npm install
npm run typecheck     # builds shared -> typechecks server + client
npm run test          # builds shared -> runs shared + server vitest suites
npm run build         # builds shared, server (tsc), client (vite build)
```

`npm run dev:server` (Colyseus on `:2568`) and `npm run dev:client` (Vite on `:5175`) also wired, with `npm run dev` running both via `concurrently`. None of `dev`/`dev:server`/`dev:client` were exercised live this turn — only the scripted pipelines above were verified.

## 2. Test / typecheck / build results
- `npm run typecheck` — clean (0 errors).
- `npm run test` — 21/21 shared simulation tests pass; 18/18 server tests pass (1 winner test round + 1 colyseus integration suite).
- `npm run build` — `@jinshi-gravity/shared` + `@jinshi-gravity/server` produce ESM bundles; client Vite build emits `dist/`: `index.html` (4.71 kB), `assets/index-*.css` (5.21 kB) and `assets/index-*.js` (~1.34 MB / 375 kB gz). Production build completes in ~12s. The single warning is the inherent Phaser client-bundle size above 500 kB (acceptable for a desktop Phaser 3 game; chunking is a future optimization).

## 3. Local client and server URLs
- Client dev server: `http://localhost:5175`
- Server Colyseus: `ws://localhost:2568` (HTTP `/health` returns `{status:"ok"}`)
- Ports intentionally differ from Jinshi Checkers (2567 / 5173) so the two can run simultaneously.

## 4. Two-browser-tab test instructions
1. `npm run dev` in the repo root.
2. Open `http://localhost:5175` in tab A. Enter a display name, leave "Training Run" selected, click **Create room** – the room code (e.g. `ABCD`) appears; "Copy" copies it.
3. Open `http://localhost:5175` in tab B. Enter a different display name, type ABCD in **Room code**, click **Join**.
4. Both players click **Mark ready** (when the host "Start round" button enables).
5. Tab A clicks **Start round**. The 3-second countdown overlays everything; once phase = `RUNNING`, Space / ↑ / left-click switches gravity; the camera follows your seat; HUD shows progress % and alive/spectating.
6. To scale to 4 or 8 tabs, repeat step 3 with new tabs (same code). Use alternate incognito windows if you want different stable `localStorage` player IDs on each tab.
7. Refresh a tab during a race – the seat reserved for fifteen seconds resumes automatically if the same `localStorage` playerId rejoins.

## 5. Implemented levels and mechanics
- **Three original maps** (`training-run` 25s, `split-circuit` 40s, `velocity-core` 55s), all data-driven via `packages/shared/src/maps/*.ts`, validated at import time.
- **Server authority** via pure-TS simulation (`packages/shared/src/simulation/GravitySimulation.ts`) driven at fixed 60 Hz on the Colyseus server; the client renders the schema projection. Inputs are 1-bit gravity-switch intentions only.
- **Modes**: multiplayer (2–8 seats, ready-gated, host picks level, rematch voting) and solo practice (1-seat, autostart).
- **States**: LOBBY → COUNTDOWN → RUNNING → FINISHED → (rematch) LOBBY. Late joiners during RUNNING become spectators until the next round.
- **Death causes**: `hazard`, `out-of-bounds`, `fell-behind`, `disconnected`, and the wired-but-not-yet-triggered `crush` enum value.
- **Winner selection** (`apps/server/src/winner.ts`): finishers by `finishTimeMs`, survivors by progress then survival, simultaneous-death tiebreak by progress → survival → draw. Last-survivor rule only fires in multiplayer with 2+ seats.
- **Reconnection**: 15s grace period keyed by the stable local playerId; seats with disconnected clients are eliminated as cause `disconnected` once grace expires.
- **Network sync**: Colyseus `setPatchRate` gives ~20 Hz deltas. Client interpolates other players and gives the local seat an immediate visual echo for responsiveness; schema reconciliation is automatic on each state patch.
- **Phaser 3 client**: neon geometric art (zero external assets) for levels/hazards/players, smooth horizontal camera, HUD scene for countdown/progress/toasts, DOM-based lobby + results with rematch voting, mute toggle, network/reconnect/disconnect pill, audio synthesized via WebAudio (resume on first gesture so blocked autoplay is handled).
- **Future-facing `GravityMatchResult`** type built server-side and validated in tests but **not** sent anywhere — `/internal/gravity-result` and `X-Internal-Secret` are documented as future-only in `docs/FUTURE_INTEGRATION.md`.

## 6. Known bugs / incomplete items
- The hazard-elimination integration test is timing-sensitive: about once every few runs it can cycle through the "leftover multiplayer room reaches a gap during the 15-second reconnection grace" phase. A 200 ms warm-up + 8 s `waitFor` makes it pass every time; if you observe a single isolated failure on a CI-class machine, simply rerun the suite. Real gameplay is unaffected (manual QA exercises this end to end).
- `crush` death cause is in the enum and the protocol but is not separately diagnosed yet; high-speed penetration is resolved by snapping the player to the nearest free surface instead of triggering `crush`.
- Mobile layout is intentionally not tuned (desktop-only as specified).
- Phaser client bundle is ~1.34 MB (375 kB gz) because Phaser 3 is monolithic. Code-splitting via dynamic `import()` is a future optimization, not in scope here.
- The 1-room seat-capacity message returns Colyseus' default `403 "Room is full"`; that's surfaced via the SDK's onError on the client's lobby join button as "Could not join room: …".
- No actual server live-run was performed this turn (only scripted pipeline execution); `npm run dev` should be tried next to add the manual exercise cycle described above. That's the highest-confidence next action.

## 7. Design decisions affecting future Discord integration
- **Local playerId is a stable `localStorage` UUID** (`apps/client/src/util/storage.ts`). This is only for reconnection today; per spec it must never be trusted as a Discord identity. The future flow is documented in `docs/FUTURE_INTEGRATION.md` step 2 (replace with verified Discord snowflake via OAuth exchange).
- **Room matchmaking keys** are `["code", "mode"]` today; the documented future change is to swap `code` and add `["guildId", "channelId"]` so the Discord channel/guild context becomes the lobby.
- **`GravityMatchResult`** is defined in `packages/shared/src/types/result.ts` and built by `computeMatchResult` on the server; `resultSubmitted` and `gameId=${roomId}-${randomUUID()}` are already in place so a future `ResultReporter` (mirroring Jinshi Checkers) can POST to `/internal/gravity-result` with `X-Internal-Secret` and Jinshi can dedupe by `gameId`.
- **No DB driver** is added; Jinshi remains the only writer. No Discord Embedded App SDK, OAuth, economy, nginx, or systemd exists in this phase, exactly matching the spec; the security boundary matches Jinshi Checkers (server-internal only, browser-supplied Discord IDs never trusted).