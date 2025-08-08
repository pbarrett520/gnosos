import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";
import { EventBus, BusEvent } from "../src/eventBus.ts";

const json = (v: unknown) => JSON.stringify(v);

describe("proxy session events", () => {
  it("emits SessionStart and SessionEnd with same session id", async () => {
    const bus = new EventBus({ ringBufferSize: 100 });
    const received: BusEvent[] = [];
    const unsub = bus.subscribe((e) => received.push(e));

    const handler = async (req: Request): Promise<Response> => {
      const body = await req.json();
      return new Response(json({ echo: body }), {
        headers: { "content-type": "application/json" },
      });
    };

    const app = createApp({ chatHandler: handler, eventBus: bus });

    const payload = { model: "m-test", messages: [{ role: "user", content: "hi" }] };
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer sk-xxxxabcd",
        "x-forwarded-for": "10.1.2.3",
      },
      body: json(payload),
    });

    expect(res.status).toBe(200);
    const start = received.find((e) => e.type === "SessionStart");
    const end = received.find((e) => e.type === "SessionEnd");
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(start!.sessionId).toBe(end!.sessionId);

    unsub();
  });
});
