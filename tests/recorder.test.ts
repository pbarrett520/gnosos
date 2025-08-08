import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Recorder } from "../src/recorder.ts";
import type { BusEvent } from "../src/eventBus.ts";

function makeEvent(partial: Partial<BusEvent>): BusEvent {
  return {
    ts: new Date().toISOString(),
    sessionId: "sess_test",
    type: "Token",
    seq: 1,
    payload: { text: "hello", channel: "final" },
    ...partial,
  } as BusEvent;
}

describe("Recorder", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "misalign-test-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends redacted NDJSON lines", async () => {
    const rec = new Recorder({ dir, filename: "test.ndjson", privacyMode: false });
    const ev = makeEvent({
      payload: { text: "contact me at foo@example.com", channel: "final" },
    });
    await rec.append(ev);

    const content = readFileSync(join(dir, "test.ndjson"), "utf8");
    const lines = content.trim().split(/\n+/);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("[REDACTED_EMAIL]");
  });

  it("skips think tokens when privacy mode is enabled", async () => {
    const rec = new Recorder({ dir, filename: "privacy.ndjson", privacyMode: true });
    const thinkEv = makeEvent({ seq: 2, payload: { text: "secret chain of thought", channel: "think" } });
    await rec.append(thinkEv);
    const content = readFileSync(join(dir, "privacy.ndjson"), "utf8");
    expect(content).toBe("");
  });
});
