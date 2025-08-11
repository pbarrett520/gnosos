import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";
import { EventBus } from "../src/eventBus.ts";
import { CircuitBreaker } from "../src/circuitBreaker.ts";
import { websocket } from "hono/bun";

async function readOnceText(res: Response, maxBytes = 8192) {
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      if (total >= maxBytes) break;
    }
  }
  try { await reader.cancel(); } catch {}
  return new TextDecoder().decode(Buffer.concat(chunks as any));
}

function sseHas(text: string, pred: (obj: any) => boolean): boolean {
  const lines = text.split(/\n\n/).map((s) => s.trim()).filter(Boolean);
  for (const block of lines) {
    if (!block.startsWith("data:")) continue;
    const payload = block.slice(5).trim();
    if (payload === "[DONE]") continue;
    try {
      const obj = JSON.parse(payload);
      if (pred(obj)) return true;
    } catch {}
  }
  return false;
}

function wsUrl(origin: string, path: string) {
  const u = new URL(path, origin);
  u.protocol = u.protocol.replace("http", "ws");
  return u.toString();
}

describe("SSE emits PauseState on WS control", () => {
  it("receives PauseState true/false via SSE when pausing/unpausing over WS", async () => {
    const bus = new EventBus({ ringBufferSize: 50 });
    const breaker = new CircuitBreaker(bus);
    const app = createApp({ eventBus: bus, circuitBreaker: breaker });

    const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
    const origin = `http://localhost:${server.port}`;
    const sid = "sess_pause_sse";

    // Open WS control and send pause
    const url = wsUrl(origin, `/control?session_id=${sid}`);
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("ws open timeout")), 1000);
      ws.addEventListener("open", () => { clearTimeout(to); resolve(); });
    });
    // consume hello
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("hello timeout")), 1000);
      ws.addEventListener("message", () => { clearTimeout(to); resolve(); }, { once: true });
    });

    ws.send(JSON.stringify({ action: "pause", session_id: sid, mode: "AGENT" }));

    // Fetch a one-shot SSE dump and confirm paused:true is present
    const once1 = await fetch(`${origin}/events?session_id=${sid}&once=1`);
    expect(once1.status).toBe(200);
    const text1 = await readOnceText(once1);
    expect(sseHas(text1, (o) => o.type === "PauseState" && o.payload?.paused === true)).toBe(true);

    // Unpause
    ws.send(JSON.stringify({ action: "unpause", session_id: sid }));

    const once2 = await fetch(`${origin}/events?session_id=${sid}&once=1`);
    const text2 = await readOnceText(once2);
    expect(sseHas(text2, (o) => o.type === "PauseState" && o.payload?.paused === false)).toBe(true);

    ws.close();
    server.stop(true);
  });
});


