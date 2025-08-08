import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, utimesSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { purgeOldFiles } from "../src/retention.ts";

describe("retention purge", () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "misalign-ret-")); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it("removes files older than N days", () => {
    const old = join(dir, "old.ndjson");
    const fresh = join(dir, "fresh.ndjson");
    writeFileSync(old, "old\n");
    writeFileSync(fresh, "fresh\n");
    const now = Date.now();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    utimesSync(old, (now - twoDaysMs) / 1000, (now - twoDaysMs) / 1000);

    const removed = purgeOldFiles(dir, 1);
    expect(removed).toContain("old.ndjson");
    const names = readdirSync(dir);
    expect(names).toContain("fresh.ndjson");
  });
});
