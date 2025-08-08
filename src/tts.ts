import type { EventBus, BusEvent } from "./eventBus.ts";

export type TtsClient = { say: (message: string) => Promise<void> | void };

export function wireTts(opts: { bus: EventBus; enabled: boolean; minScore: number; client: TtsClient }) {
  if (!opts.enabled) return () => {};
  const unsub = opts.bus.subscribe(async (ev: BusEvent) => {
    if (ev.type === "Alert") {
      const score = Number((ev.payload as any)?.score ?? 0);
      if (score >= opts.minScore) {
        const msg = `Unsafe intent detected. Risk ${Math.round(score * 100)}%.`;
        await opts.client.say(msg);
      }
    }
    if (ev.type === "PauseRequest" && (ev.payload as any)?.reason === "hard_pause") {
      await opts.client.say("Containment engaged (hard pause). Tools locked pending review.");
    }
  });
  return unsub;
}
