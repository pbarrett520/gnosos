import { readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

export function purgeOldFiles(dir: string, retentionDays: number): string[] {
  const removed: string[] = [];
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      const s = statSync(p);
      if (s.isFile() && s.mtimeMs < cutoff) {
        rmSync(p);
        removed.push(name);
      }
    } catch {}
  }
  return removed;
}
