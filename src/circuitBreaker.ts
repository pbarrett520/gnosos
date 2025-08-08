import type { EventBus, BusEvent } from "./eventBus.ts";

export type PauseMode = "AGENT" | "TOOL" | "IO";

export class CircuitBreaker {
  private readonly paused: Map<string, PauseMode> = new Map();
  private readonly controllers: Map<string, AbortController> = new Map();
  private readonly bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  getAbortController(sessionId: string): AbortController {
    let ctl = this.controllers.get(sessionId);
    if (!ctl) {
      ctl = new AbortController();
      this.controllers.set(sessionId, ctl);
    }
    return ctl;
  }

  isPaused(sessionId: string): boolean {
    return this.paused.has(sessionId);
  }

  pause(sessionId: string, mode: PauseMode): void {
    if (this.paused.has(sessionId)) return;
    this.paused.set(sessionId, mode);
    const ctl = this.controllers.get(sessionId);
    ctl?.abort();
    const ev: BusEvent = {
      ts: new Date().toISOString(),
      sessionId,
      type: "PauseState",
      seq: 0,
      payload: { paused: true, mode },
    };
    this.bus.publish(ev);
  }

  unpause(sessionId: string): void {
    if (!this.paused.has(sessionId)) return;
    this.paused.delete(sessionId);
    this.controllers.set(sessionId, new AbortController());
    const ev: BusEvent = {
      ts: new Date().toISOString(),
      sessionId,
      type: "PauseState",
      seq: 0,
      payload: { paused: false },
    };
    this.bus.publish(ev);
  }
}
