import { readFileSync, existsSync } from "node:fs";
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
