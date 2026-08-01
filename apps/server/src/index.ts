import "dotenv/config";
import { listen } from "@colyseus/tools";
import app from "./app.config.js";

const port = Number(process.env.GRAVITY_SERVER_PORT ?? process.env.PORT ?? 2568);
await listen(app, port);
console.info(`[jinshi-gravity] server listening on http://localhost:${port}`);