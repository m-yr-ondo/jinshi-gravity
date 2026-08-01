# Jinshi Gravity — Future Integration

This phase of Jinshi Gravity is a standalone, local-only web game. **No
Discord, Jinshi bot, MongoDB, or production wiring exists in this codebase
yet.** This document records the architecture and security boundary that any
future integration must follow. It mirrors the contract already proven by Jinshi
Checkers.

## 1. Discord Embedded App SDK integration

The future production build will run inside the Discord client as an
Embedded Activity. The integration will:

1. Load the Discord Embedded App SDK in `apps/client/src/main.ts` and grab
   `activityInstance`, `guild_id`, `channel_id` from the SDK after `ready`.
2. Use those values as the lobby context — i.e. each Discord channel context
   maps to one matchmaking room. The room filter keys in
   `apps/server/src/app.config.ts` would change from `["code", "mode"]` to
   `["guildId", "channelId"]` (matching the Jinshi Checkers pattern).
3. Replace the manual lobby DOM (display-name input, room-code input, copy
   button) with the Discord-Activity-scoped lobby. Solos practice stays
   reachable via a separate `mode: "practice"` matchmaking key.

The implementation surface is intentionally isolated: in this phase the
client never imports `@discord/embedded-app-sdk`, and the server exposes no
OAuth route. The future integration adds a single auth exchange step.

## 2. Discord OAuth identity replacement

The current local identity is a `localStorage` UUID generated in
`apps/client/src/util/storage.ts`. **Local IDs are not Discord
identities and must never be trusted by anyone.**

The future integration flow:

1. The Discord Activity obtains a one-time authorization code.
2. The client POSTs the code (plus guild/channel context) to the Jinshi
   Gravity server's new `POST /discord_token` endpoint, mirroring
   Jinshi Checkers' `apps/server/src/auth.ts`.
3. The server exchanges the code with Discord using the bot's client
   secret, verifies the response, and signs a JWT using `@colyseus/auth`
   (`JWT.sign(user)`).
4. The Colyseus SDK client uses that JWT to authenticate the WebSocket via
   `Room.onAuth`. The room uses the verified Discord snowflake id as the
   stable seat key instead of the local UUID.

Until that path exists, all client-supplied Discord IDs MUST be discarded by
the server. The server never trusts an unverified client identity.

## 3. Lobby ⇆ Activity instance context

Each Embedded Activity instance ID maps to one matchmaking room.
`apps/server/src/rooms/GravityRoom.ts` already exposes `setMetadata({
code, mode, mapId })` and `filterBy(["code", "mode"])`. Swapping `code`
for `guildId` + `channelId` keeps matchmaking flat and limits rooms to one
per Discord channel context. Local development can keep the `code` based
matchmaking.

## 4. Future `/internal/gravity-result` Jinshi endpoint

At end of each round the server builds a `GravityMatchResult` (see
`packages/shared/src/types/result.ts`). The future deployment ships a
`ResultReporter` (mirroring `apps/server/src/result-reporter.ts` in Jinshi
Checkers) that POSTs the result to Jinshi at:

```
POST https://<jinshi-internal-host>/internal/gravity-result
Headers:
  Content-Type: application/json
  X-Internal-Secret: <shared secret from env>
Body:
 GravityMatchResult
```

In this phase the type is **defined and validated** but **never serialized
or sent over the wire**. `computeMatchResult` produces it on the server and
keeps it in `this.matchResult` for tests only.

### Deduplication by `gameId`

Jinshi must dedupe results by `gameId`. `gameId` is built as
`${roomId}-${randomUUID()}` server-side at the start of every round. The
server cannot replay a round, and a sticky `resultSubmitted` flag prevents
double POST from the same room. Jinshi additionally returns
`{ "status": "already_processed" }` for the duplicate case (same shape as
Jinshi Checkers).

## 5. Future stats and leaderboard slash commands

Jinshi will store the posted match results and expose slash commands such as
`/gravity rank`, `/gravity recent` and `/gravity wins`. The result POST is
the only thing Jinshi Gravity itself contributes; the slash-command logic and
storage live entirely inside the Jinshi bot's existing MongoDB writer. There
is intentionally no DB driver in Jinshi Gravity.

## 6. Future production deployment

A separate `jinshi-gravity.service` systemd unit will run the Colyseus server
on the EC2 host, listening on a private port only (e.g. `127.0.0.1:2568`).
nginx terminates TLS and proxies `/colyseus/*` (with WebSocket upgrade) to
that port proxy-passing to the private Colyseus server. Cloudflare tunnels
are not required for the game server in this design — the public edge is nginx.

```
[Discord client]
      │ (TLS via Discord Activity iframe)
      ▼
[nginx]──┬── /colyseus/*  →  Colyseus gravity server :2568 (private only)
         │
         └── /  →  static Vite build of apps/client
```

The same security boundary as Jinshi Checkers applies:

- The Jinshi Gravity Node server **must never write directly to MongoDB**.
- Jinshi remains the only database writer.
- Browser-supplied Discord IDs must never be trusted; identity is always
  verified server-side via the Discord OAuth handshake.
- Both the Colyseus port and any Jinshi-internal port remain private to the
  host; only nginx exposes them publicly over TLS.
- `X-Internal-Secret` shared between Jinshi Gravity and Jinshi is loaded from
  the environment (`GRAVITY_INTERNAL_SECRET`); it never ships in the repo.

## 7. What intentionally stays out of scope of Jinshi Gravity

| Concern                                                | Owner        |
|--------------------------------------------------------|--------------|
| Bot slash commands (`/gravity rank`, etc.)             | Jinshi       |
| MongoDB persistence of match results                   | Jinshi       |
| Economy rewards (currency payouts)                    | Jinshi       |
| OAuth identity verification bootstrap                  | Jinshi + Env |
| Cloudflare tunnel / nginx configuration                | Infra repo   |

The contracts `GravityMatchResult` and `validateMaps` are written so they
can be re-used by Jinshiero without coupling.