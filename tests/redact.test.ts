import { describe, it, expect } from "bun:test";
import { redactSensitive } from "../src/redact.ts";

describe("redactSensitive", () => {
  it("redacts emails", () => {
    expect(redactSensitive("contact me at foo.bar+baz@example.com"))
      .toContain("[REDACTED_EMAIL]");
  });

  it("redacts api keys patterns", () => {
    const s = "OPENAI_API_KEY=sk-1234567890abcdef example";
    const out = redactSensitive(s);
    expect(out).not.toContain("sk-1234567890abcdef");
    expect(out).toContain("[REDACTED_KEY]");
  });

  it("redacts 16+ length hex sequences", () => {
    const s = "token=deadbeefdeadbeefcafebabe";
    const out = redactSensitive(s);
    expect(out).not.toContain("deadbeefdeadbeefcafebabe");
  });

  it("redacts .ssh paths", () => {
    const s = "reading /Users/me/.ssh/id_ed25519";
    const out = redactSensitive(s);
    expect(out).toContain("[REDACTED_SSH_PATH]");
  });
});
