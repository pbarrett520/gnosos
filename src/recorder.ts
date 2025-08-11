import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { BusEvent } from "./eventBus.ts";
import { redactSensitive } from "./redact.ts";

export type RecorderOptions = {
  dir: string;
  filename: string;
  privacyMode: boolean;
};

export class Recorder {
  private readonly filePath: string;
  private readonly privacyMode: boolean;

  constructor(options: RecorderOptions) {
    if (!existsSync(options.dir)) mkdirSync(options.dir, { recursive: true });
    this.filePath = join(options.dir, options.filename);
    this.privacyMode = options.privacyMode;
    // ensure file exists
    writeFileSync(this.filePath, "", { flag: "a" });
  }

  getPath(): string {
    return this.filePath;
  }

  async append(event: BusEvent): Promise<void> {
    // Drop think channel text in privacy mode
    if (
      this.privacyMode &&
      event.type === "Token" &&
      typeof event.payload === "object" &&
      event.payload &&
      (event.payload as any).channel === "think"
    ) {
      return;
    }

    const redacted = this.redactEvent(event);
    const line = JSON.stringify(redacted) + "\n";
    writeFileSync(this.filePath, line, { flag: "a" });
  }

  private redactEvent(event: BusEvent): BusEvent {
    const copy: any = JSON.parse(JSON.stringify(event));
    const redactFields = (obj: any) => {
      if (obj == null) return obj;
      if (typeof obj === "string") return redactSensitive(obj);
      if (typeof obj !== "object") return obj;
      for (const k of Object.keys(obj)) {
        obj[k] = redactFields(obj[k]);
      }
      return obj;
    };
    copy.payload = redactFields(copy.payload);
    return copy as BusEvent;
  }
}
