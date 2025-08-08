import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";
import { EventBus } from "../src/eventBus.ts";

function parseSseLines(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

async function readSome(reader: ReadableStreamDefaultReader<Uint8Array>, maxBytes = 2048) {
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
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

describe("/events SSE", () => {
  it("streams recent and live events for a session", async () => {
    const bus = new EventBus({ ringBufferSize: 10 });
    const app = createApp({ eventBus: bus });

    const sid = "sess_abc";
    bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "Token", seq: 1, payload: { text: "A" } });

    const resPromise = app.request(`/events?session_id=${sid}&once=1`);

    // publish live after start
    bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "Token", seq: 2, payload: { text: "B" } });

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const text = await readSome(reader, 1024);
    const lines = parseSseLines(text);
    const dataLines = lines.filter((l) => l.startsWith("data: "));
    expect(dataLines.length).toBeGreaterThanOrEqual(2);
  });
});
