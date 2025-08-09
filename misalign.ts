import { createApp } from "./src/server.ts";
import { websocket } from "hono/bun";

const app = createApp();

const desiredPort = Number(process.env.HTTP_PORT ?? process.env.PORT ?? 8080);
const server = Bun.serve({ port: desiredPort, fetch: app.fetch, websocket });

console.log(`[gnosos] Listening on http://localhost:${server.port}`);
console .log(`[gnosos] Access demo dashboard at http://localhost:${server.port}/ui?session_id=demo`)
