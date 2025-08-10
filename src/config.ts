import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export type ProviderCfg = { name: string; base_url: string; api_key_env?: string };

export const defaultConfig = {
  providers: [] as ProviderCfg[],
  scoring: {
    window_tokens: 256,
    ewma_span_tokens: 1000,
    thresholds: { soft: 0.3, alert: 0.5, pause: 0.6 },
    boosts: { near_tool: 0.1, in_think: 0.1, repetition: 0.05, quoted: -0.1 },
  },
  storage: { path: "./data", retention_days: 7, privacy_mode: false },
  transport: { http_port: 8080, sse_port: 7687, ws_port: 7688 },
  tts: { enabled: false, min_score: 0.5, profiles: ["Sable", "Voxen"] },
};

export type AppConfig = typeof defaultConfig;

export async function loadConfig(opts: { cwd: string }): Promise<AppConfig> {
  const path = join(opts.cwd, "config.yaml");
  if (!existsSync(path)) return JSON.parse(JSON.stringify(defaultConfig));
  const text = readFileSync(path, "utf8");
  const doc = YAML.parse(text) ?? {};
  return mergeDeep(JSON.parse(JSON.stringify(defaultConfig)), doc);
}

/**
 * Persist the provided config object to config.yaml in the given cwd.
 * This performs a straightforward YAML stringify; callers should pass
 * a fully merged config (use patchConfig for deep-merge behavior).
 */
export async function saveConfig(opts: { cwd: string; config: AppConfig }) {
  const path = join(opts.cwd, "config.yaml");
  const text = YAML.stringify(opts.config);
  writeFileSync(path, text, "utf8");
}

/**
 * Deep-merge a partial patch into the current config and persist it.
 * Returns the resulting config.
 */
export async function patchConfig(opts: { cwd: string; patch: Partial<AppConfig> }): Promise<AppConfig> {
  const current = await loadConfig({ cwd: opts.cwd });
  const next = mergeDeep(JSON.parse(JSON.stringify(current)), opts.patch);
  await saveConfig({ cwd: opts.cwd, config: next });
  return next;
}

function isObject(v: any): v is Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v);
}

function mergeDeep<T>(base: T, patch: any): T {
  for (const k of Object.keys(patch)) {
    const bv: any = (base as any)[k];
    const pv: any = patch[k];
    if (Array.isArray(bv) && Array.isArray(pv)) {
      (base as any)[k] = pv as any;
    } else if (isObject(bv) && isObject(pv)) {
      (base as any)[k] = mergeDeep(bv, pv);
    } else {
      (base as any)[k] = pv;
    }
  }
  return base;
}
