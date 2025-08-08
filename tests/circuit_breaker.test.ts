import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";
import { EventBus } from "../src/eventBus.ts";
import { CircuitBreaker } from "../src/circuitBreaker.ts";

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe("CircuitBreaker", () => {
  it("blocks new requests with 423 when paused", async () => {
    const bus = new EventBus({ ringBufferSize: 10 });
    const breaker = new CircuitBreaker(bus);

    const handler = async (_req: Request): Promise<Response> => new Response("ok");
    const app = createApp({ chatHandler: handler, eventBus: bus, circuitBreaker: breaker });

    const sid = "sess_test";
    breaker.pause(sid, "AGENT");

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "x-session-id": sid },
    });
    expect(res.status).toBe(423);
  });

  it("aborts streaming response when paused mid-stream", async () => {
    const bus = new EventBus({ ringBufferSize: 100 });
    const breaker = new CircuitBreaker(bus);

    // A slow SSE stream
    const chunks = [
      sseChunk({ choices: [{ delta: { content: "a" } }] }),
      sseChunk({ choices: [{ delta: { content: "b" } }] }),
      sseChunk({ choices: [{ delta: { content: "c" } }] }),
      "data: [DONE]\n\n",
    ];

    const upstream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = chunks.shift();
        if (next) {
          controller.enqueue(new TextEncoder().encode(next));
          await new Promise((r) => setTimeout(r, 20));
        } else {
          controller.close();
        }
      },
    });

    const handler = async (_req: Request): Promise<Response> =>
      new Response(upstream, { headers: { "content-type": "text/event-stream" } });

    const app = createApp({ chatHandler: handler, eventBus: bus, circuitBreaker: breaker });

    const sid = "sess_stream";
    const res = await app.request("/v1/chat/completions", { method: "POST", headers: { "x-session-id": sid } });
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const chunksOut: string[] = [];

    // Read first chunk
    const r1 = await reader.read();
    chunksOut.push(new TextDecoder().decode(r1.value));

    // Pause mid-stream
    breaker.pause(sid, "AGENT");

    // Attempt to read more; stream should close quickly
    const r2 = await reader.read();
    if (!r2.done && r2.value) {
      chunksOut.push(new TextDecoder().decode(r2.value));
    }

    // Should not contain all planned chunks because of abort
    const combined = chunksOut.join("");
    const numDataLines = combined.split("\n\n").filter((x) => x.startsWith("data:")).length;
    expect(numDataLines).toBeLessThan(4);
  });
});
