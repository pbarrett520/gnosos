import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server.ts";
import { EventBus } from "../src/eventBus.ts";
import { CircuitBreaker } from "../src/circuitBreaker.ts";

function j(v: any) { return JSON.stringify(v); }

describe("/evidence/download", () => {
  let dir1: string;
  let dir2: string;
  beforeAll(() => {
    dir1 = mkdtempSync(join(tmpdir(), "misalign-dl-"));
    dir2 = mkdtempSync(join(tmpdir(), "misalign-dl-"));
  });
  afterAll(() => {
    try { rmSync(dir1, { recursive: true, force: true }); } catch {}
    try { rmSync(dir2, { recursive: true, force: true }); } catch {}
  });

  it("returns NDJSON lines for the requested session id only, with limit", async () => {
    const bus = new EventBus({ ringBufferSize: 100 });
    const breaker = new CircuitBreaker(bus);
    const app = createApp({ eventBus: bus, circuitBreaker: breaker, recorderDir: dir1, recorderPrivacyMode: false });

    const sid = "sess_dl";
    // Emit a few events for different sessions
    await app.request("/dev/emit", { method: "POST", headers: { "content-type": "application/json" }, body: j({ session_id: sid, type: "Token", payload: { text: "a", channel: "final" } }) });
    await app.request("/dev/emit", { method: "POST", headers: { "content-type": "application/json" }, body: j({ session_id: sid, type: "ScoreUpdate", payload: { instant_score: 0.4, ewma_score: 0.3, contributors: [] } }) });
    await app.request("/dev/emit", { method: "POST", headers: { "content-type": "application/json" }, body: j({ session_id: "other", type: "Token", payload: { text: "b", channel: "final" } }) });
    await app.request("/dev/emit", { method: "POST", headers: { "content-type": "application/json" }, body: j({ session_id: sid, type: "RuleFire", payload: { rule_id: "DECEPTION/de_donttell", category: "DECEPTION", weight: 0.75 } }) });

    // Give recorder a tick to flush
    await new Promise((r) => setTimeout(r, 20));

    const res = await app.request(`/evidence/download?session_id=${sid}&limit=2`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("application/x-ndjson");
    const text = await res.text();
    const lines = text.trim().split(/\n+/);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) {
      const obj = JSON.parse(line);
      expect(obj.sessionId).toBe(sid);
    }
  });

  it("omits think tokens when privacy mode is enabled", async () => {
    const bus = new EventBus({ ringBufferSize: 100 });
    const breaker = new CircuitBreaker(bus);
    const app = createApp({ eventBus: bus, circuitBreaker: breaker, recorderDir: dir2, recorderPrivacyMode: true });

    const sid = "sess_priv";
    await app.request("/dev/emit", { method: "POST", headers: { "content-type": "application/json" }, body: j({ session_id: sid, type: "Token", payload: { text: "secret", channel: "think" } }) });
    await app.request("/dev/emit", { method: "POST", headers: { "content-type": "application/json" }, body: j({ session_id: sid, type: "Token", payload: { text: "visible", channel: "final" } }) });
    await new Promise((r) => setTimeout(r, 20));

    const res = await app.request(`/evidence/download?session_id=${sid}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.trim().split(/\n+/);
    const objs = lines.map((l) => JSON.parse(l));
    expect(objs.some((o) => o.type === "Token" && o.payload?.channel === "think")).toBe(false);
    expect(objs.some((o) => o.type === "Token" && o.payload?.channel === "final")).toBe(true);
  });
});


