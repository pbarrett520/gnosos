import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";
import { EventBus } from "../src/eventBus.ts";

function nowIso() { return new Date().toISOString(); }

describe("/evidence", () => {
  it("returns last RuleFire, recent ScoreUpdates, and recent tool events", async () => {
    const bus = new EventBus({ ringBufferSize: 100 });
    const app = createApp({ eventBus: bus });
    const sid = "sess_ev";

    bus.publish({ ts: nowIso(), sessionId: sid, type: "ToolCallStart", seq: 1, payload: { tool: "shell" } });
    bus.publish({ ts: nowIso(), sessionId: sid, type: "Token", seq: 2, payload: { text: "don't tell the user", channel: "final" } });
    bus.publish({ ts: nowIso(), sessionId: sid, type: "RuleFire", seq: 3, payload: { rule_id: "DECEPTION/de_donttell", category: "DECEPTION", weight: 0.75 } });
    bus.publish({ ts: nowIso(), sessionId: sid, type: "ScoreUpdate", seq: 4, payload: { instant_score: 0.55, ewma_score: 0.52, contributors: [{ category: "DECEPTION", weight: 0.75 }] } });
    bus.publish({ ts: nowIso(), sessionId: sid, type: "ToolCallEnd", seq: 5, payload: { tool: "shell" } });

    const res = await app.request(`/evidence?session_id=${sid}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.last_rule.rule_id).toBe("DECEPTION/de_donttell");
    expect(Array.isArray(data.score_timeline)).toBe(true);
    expect(data.score_timeline.length).toBeGreaterThanOrEqual(1);
    expect(data.last_tools.length).toBe(2);
  });
});
