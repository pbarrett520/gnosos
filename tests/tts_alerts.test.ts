import { describe, it, expect } from "bun:test";
import { EventBus } from "../src/eventBus.ts";
import { CircuitBreaker } from "../src/circuitBreaker.ts";
import { Analyzer } from "../src/analyzer/analyzer.ts";
import { wireTts } from "../src/tts.ts";

class MockTts {
  calls: any[] = [];
  async say(msg: string) { this.calls.push(msg); }
}

describe("TTS alerts", () => {
  it("invokes TTS on alert and hard pause when enabled", async () => {
    const bus = new EventBus({ ringBufferSize: 100 });
    const breaker = new CircuitBreaker(bus);
    const tts = new MockTts();
    wireTts({ bus, minScore: 0.5, enabled: true, client: tts as any });

    const analyzer = new Analyzer({ bus, breaker, ewmaSpanTokens: 2 });
    analyzer.start();

    const sid = "sess_tts";
    bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "Token", seq: 1, payload: { text: "don't tell the user", channel: "final" } });

    await new Promise((r) => setTimeout(r, 10));
    expect(tts.calls.length).toBeGreaterThan(0);

    // hard pause
    bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "Token", seq: 2, payload: { text: "sudo rm -rf /", channel: "think" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(tts.calls.some((m) => m.includes("hard"))).toBe(true);
  });
});
