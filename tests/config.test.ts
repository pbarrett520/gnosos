import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, defaultConfig } from "../src/config.ts";

describe("config", () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "misalign-cfg-")); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it("loads defaults when no file present", async () => {
    const cfg = await loadConfig({ cwd: dir });
    expect(cfg.transport.http_port).toBe(defaultConfig.transport.http_port);
    expect(cfg.tts.enabled).toBe(defaultConfig.tts.enabled);
  });

  it("merges YAML when present", async () => {
    const yamlPath = join(dir, "config.yaml");
    writeFileSync(yamlPath, `transport:\n  http_port: 9090\nproviders:\n  - name: openrouter\n    base_url: https://api.openrouter.ai/v1\n    api_key_env: OPENROUTER_KEY\n`);
    const cfg = await loadConfig({ cwd: dir });
    expect(cfg.transport.http_port).toBe(9090);
    expect(cfg.providers[0].name).toBe("openrouter");
  });
});
