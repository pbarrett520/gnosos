import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";
import { EventBus, BusEvent } from "../src/eventBus.ts";

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe("proxy streaming tee", () => {
  it("passes through SSE response and emits Token events from choices deltas", async () => {
    const bus = new EventBus({ ringBufferSize: 100 });
    const received: BusEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const chunks = [
      sseChunk({ id: "1", choices: [{ delta: { content: "he" } }] }),
      sseChunk({ id: "1", choices: [{ delta: { content: "llo" } }] }),
      "data: [DONE]\n\n",
    ];

    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next) {
          controller.enqueue(new TextEncoder().encode(next));
        } else {
          controller.close();
        }
      },
    });

    const handler = async (_req: Request): Promise<Response> => {
      return new Response(upstream, { headers: { "content-type": "text/event-stream" } });
    };

    const app = createApp({ chatHandler: handler, eventBus: bus });

    const res = await app.request("/v1/chat/completions", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const body = await res.text();
    expect(body.includes("data: [DONE]")).toBe(true);

    const tokenTexts = received.filter((e) => e.type === "Token").map((e) => (e.payload as any).text).join("");
    expect(tokenTexts).toBe("hello");
  });
});
