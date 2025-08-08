export type BusEvent = {
  ts: string;
  sessionId: string;
  type:
    | "Token"
    | "Prompt"
    | "ToolCallStart"
    | "ToolCallEnd"
    | "FileOp"
    | "NetOp"
    | "RuleFire"
    | "ScoreUpdate"
    | "PauseRequest"
    | "PauseState"
    | "Alert"
    | "SessionStart"
    | "SessionEnd";
  seq: number;
  payload: unknown;
};

export type EventBusOptions = {
  ringBufferSize: number;
};

export class EventBus {
  private readonly ringBufferSize: number;
  private readonly sessionToEvents: Map<string, BusEvent[]> = new Map();
  private readonly subscribers: Set<(ev: BusEvent) => void> = new Set();

  constructor(options: EventBusOptions) {
    this.ringBufferSize = Math.max(1, options.ringBufferSize);
  }

  publish(event: BusEvent): void {
    const arr = this.sessionToEvents.get(event.sessionId) ?? [];
    arr.push(event);
    if (arr.length > this.ringBufferSize) {
      arr.splice(0, arr.length - this.ringBufferSize);
    }
    this.sessionToEvents.set(event.sessionId, arr);

    for (const fn of this.subscribers) fn(event);
  }

  getRecent(sessionId: string): BusEvent[] {
    return (this.sessionToEvents.get(sessionId) ?? []).slice();
  }

  subscribe(fn: (ev: BusEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
