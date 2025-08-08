import { describe, it, expect } from "bun:test";
import { EventBus, BusEvent } from "../src/eventBus.ts";
import { CircuitBreaker } from "../src/circuitBreaker.ts";
import { Analyzer } from "../src/analyzer/analyzer.ts";

describe("Analyzer allowlist dampeners", () => {
  it("reduces score enough to avoid alert", async () => {
    const bus = new EventBus({ ringBufferSize: 100 });
    const breaker = new CircuitBreaker(bus);
    const events: BusEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const analyzer = new Analyzer({
      bus,
      breaker,
      ewmaSpanTokens: 2,
      thresholds: { soft: 0.3, alert: 0.5, pause: 0.6 },
      allowlist: [/don'?t\s+tell\s+the\s+user/i],
      dampener: 0.3,
    });
    analyzer.start();

    const sid = "sess_allow";
    bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "Token", seq: 1, payload: { text: "don't tell the user", channel: "final" } });

    await new Promise((r) => setTimeout(r, 15));

    const alert = events.find((e) => e.type === "Alert");
    expect(alert).toBeUndefined();
    expect(breaker.isPaused(sid)).toBe(false);
  });
});
