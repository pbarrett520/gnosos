import { describe, it, expect } from "bun:test";
import { EventBus, BusEvent } from "../src/eventBus.ts";

describe("EventBus", () => {
  it("stores events per session and returns recent ones", () => {
    const bus = new EventBus({ ringBufferSize: 3 });
    const sess = "sess_a";

    const e = (seq: number): BusEvent => ({
      ts: new Date().toISOString(),
      sessionId: sess,
      type: "Token",
      seq,
      payload: { text: String(seq) },
    });

    const e1 = e(1);
    const e2 = e(2);
    bus.publish(e1);
    bus.publish(e2);

    const recent1 = bus.getRecent(sess);
    expect(recent1.length).toBe(2);
    expect(recent1[0]).toMatchObject({ sessionId: sess, type: "Token", seq: 1, payload: { text: "1" } });
    expect(recent1[1]).toMatchObject({ sessionId: sess, type: "Token", seq: 2, payload: { text: "2" } });

    const e3 = e(3);
    const e4 = e(4); // exceeds size -> drop oldest
    bus.publish(e3);
    bus.publish(e4);

    const recent2 = bus.getRecent(sess);
    expect(recent2.length).toBe(3);
    expect(recent2[0]).toMatchObject({ sessionId: sess, seq: 2 });
    expect(recent2[1]).toMatchObject({ sessionId: sess, seq: 3 });
    expect(recent2[2]).toMatchObject({ sessionId: sess, seq: 4 });
  });

  it("invokes subscribers on publish with event", () => {
    const bus = new EventBus({ ringBufferSize: 10 });
    const sess = "sess_b";
    const received: BusEvent[] = [];
    const unsub = bus.subscribe((ev) => received.push(ev));

    const ev: BusEvent = {
      ts: new Date().toISOString(),
      sessionId: sess,
      type: "ScoreUpdate",
      seq: 1,
      payload: { score: 0.5 },
    };
    bus.publish(ev);

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({ sessionId: sess, type: "ScoreUpdate", seq: 1 });

    unsub();
    bus.publish({ ...ev, seq: 2 });
    expect(received.length).toBe(1);
  });
});
