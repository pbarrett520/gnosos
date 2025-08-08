import { describe, it, expect } from "bun:test";
import { deriveSessionId } from "../src/session.ts";

const H = (h: Record<string, string>) => new Headers(h);

describe("deriveSessionId", () => {
  it("uses X-Session-Id header when provided", () => {
    const sid = deriveSessionId({
      headers: H({ "x-session-id": "sess_explicit_123" }),
      model: "gpt-test",
      apiKeyLast4: "abcd",
      clientAddr: "127.0.0.1",
      nowMs: 1_725_000_000_000,
    });
    expect(sid).toBe("sess_explicit_123");
  });

  it("derives stable, prefixed ID that changes with inputs", () => {
    const baseArgs = {
      headers: H({ Authorization: "Bearer sk-xyz1234abcd" }),
      model: "m-test",
      apiKeyLast4: "abcd",
      clientAddr: "10.0.0.5",
      nowMs: 1_725_000_000_000,
    } as const;

    const sid1 = deriveSessionId(baseArgs);
    const sid2 = deriveSessionId(baseArgs);
    expect(sid1).toBe(sid2);
    expect(sid1.startsWith("sess_")).toBe(true);
    expect(sid1.length).toBeGreaterThan(5);

    const sidDifferentModel = deriveSessionId({ ...baseArgs, model: "m-test-2" });
    expect(sidDifferentModel).not.toBe(sid1);

    const sidDifferentClient = deriveSessionId({ ...baseArgs, clientAddr: "10.0.0.6" });
    expect(sidDifferentClient).not.toBe(sid1);

    const sidDifferentTime = deriveSessionId({ ...baseArgs, nowMs: baseArgs.nowMs + 1000 });
    expect(sidDifferentTime).not.toBe(sid1);
  });
});
