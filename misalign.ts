import { createApp } from "./src/server.ts";

const app = createApp();

const desiredPort = Number(process.env.HTTP_PORT ?? process.env.PORT ?? 8080);
const server = Bun.serve({ port: desiredPort, fetch: app.fetch });

console.log(`[misalign] listening on http://localhost:${server.port}`);
