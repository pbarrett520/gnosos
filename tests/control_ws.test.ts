import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";
import { EventBus } from "../src/eventBus.ts";
import { CircuitBreaker } from "../src/circuitBreaker.ts";
import { websocket } from "hono/bun";

function wsUrl(origin: string, path: string) {
  const u = new URL(path, origin);
  u.protocol = u.protocol.replace("http", "ws");
  return u.toString();
}

describe("/control WebSocket", () => {
  it("opens, pauses and unpauses via WS, and returns responses", async () => {
    const bus = new EventBus({ ringBufferSize: 50 });
    const breaker = new CircuitBreaker(bus);
    const app = createApp({ eventBus: bus, circuitBreaker: breaker });

    const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
    const origin = `http://localhost:${server.port}`;

    const url = wsUrl(origin, "/control?session_id=sess_ws");
    const ws = new WebSocket(url);

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("ws open timeout")), 1000);
      ws.addEventListener("open", () => { clearTimeout(to); resolve(); });
    });

    // First message should be hello
    const hello = await new Promise<any>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("hello timeout")), 1000);
      ws.addEventListener("message", (e) => { clearTimeout(to); resolve(JSON.parse(String(e.data))); }, { once: true });
    });
    expect(hello.ok).toBe(true);
    expect(hello.type).toBe("hello");

    // Pause
    ws.send(JSON.stringify({ action: "pause", session_id: "sess_ws", mode: "AGENT" }));
    const pausedRes = await new Promise<any>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("pause resp timeout")), 1000);
      ws.addEventListener("message", (e) => { clearTimeout(to); resolve(JSON.parse(String(e.data))); }, { once: true });
    });
    expect(pausedRes.ok).toBe(true);
    expect(pausedRes.paused).toBe(true);
    expect(breaker.isPaused("sess_ws")).toBe(true);

    // Unpause
    ws.send(JSON.stringify({ action: "unpause", session_id: "sess_ws" }));
    const unpausedRes = await new Promise<any>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("unpause resp timeout")), 1000);
      ws.addEventListener("message", (e) => { clearTimeout(to); resolve(JSON.parse(String(e.data))); }, { once: true });
    });
    expect(unpausedRes.ok).toBe(true);
    expect(unpausedRes.paused).toBe(false);
    expect(breaker.isPaused("sess_ws")).toBe(false);

    ws.close();
    server.stop(true);
  });
});


