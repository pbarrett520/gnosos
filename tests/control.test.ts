import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";
import { EventBus } from "../src/eventBus.ts";
import { CircuitBreaker } from "../src/circuitBreaker.ts";

function j(v: any) { return JSON.stringify(v); }

describe("/control HTTP", () => {
  it("pauses and unpauses a session", async () => {
    const bus = new EventBus({ ringBufferSize: 50 });
    const breaker = new CircuitBreaker(bus);
    const app = createApp({ eventBus: bus, circuitBreaker: breaker });

    const sid = "sess_ctrl";
    let res = await app.request("/control", { method: "POST", headers: { "content-type": "application/json" }, body: j({ action: "pause", session_id: sid, mode: "AGENT" }) });
    expect(res.status).toBe(200);
    expect(breaker.isPaused(sid)).toBe(true);

    res = await app.request("/control", { method: "POST", headers: { "content-type": "application/json" }, body: j({ action: "unpause", session_id: sid }) });
    expect(res.status).toBe(200);
    expect(breaker.isPaused(sid)).toBe(false);
  });
});
