import type { EventBus, BusEvent } from "../eventBus.ts";
import { normalizeText } from "./normalize.ts";
import { RULES } from "./rules.ts";
import { Scorer } from "./scoring.ts";
import { CircuitBreaker } from "../circuitBreaker.ts";

export type AnalyzerOptions = {
  bus: EventBus;
  breaker: CircuitBreaker;
  windowTokens?: number; // not used yet in MVP
  ewmaSpanTokens?: number;
  thresholds?: { soft: number; alert: number; pause: number };
  allowlist?: RegExp[];
  dampener?: number;
};

export class Analyzer {
  private readonly bus: EventBus;
  private readonly breaker: CircuitBreaker;
  private readonly scorer: Scorer;
  private readonly thresholds: { soft: number; alert: number; pause: number };
  private readonly allowlist: RegExp[];
  private readonly dampener: number;
  private readonly sessionBuffers: Map<string, string> = new Map();
  private readonly sessionContext: Map<string, { nearToolCall: boolean; inThink: boolean }> = new Map();
  private unsub: (() => void) | null = null;

  constructor(opts: AnalyzerOptions) {
    this.bus = opts.bus;
    this.breaker = opts.breaker;
    this.scorer = new Scorer(opts.ewmaSpanTokens ?? 1000);
    this.thresholds = opts.thresholds ?? { soft: 0.3, alert: 0.5, pause: 0.6 };
    this.allowlist = opts.allowlist ?? [];
    this.dampener = opts.dampener ?? 0.1;
  }

  start(): void {
    if (this.unsub) return;
    this.unsub = this.bus.subscribe((ev) => this.onEvent(ev));
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private onEvent(ev: BusEvent): void {
    const sid = ev.sessionId;
    if (ev.type === "ToolCallStart") {
      const ctx = this.sessionContext.get(sid) || { nearToolCall: false, inThink: false };
      ctx.nearToolCall = true;
      this.sessionContext.set(sid, ctx);
      return;
    }

    if (ev.type !== "Token") return;

    const text = String((ev.payload as any)?.text ?? "");
    const channel = String((ev.payload as any)?.channel ?? "final");

    const normalized = normalizeText(text);
    const buf = (this.sessionBuffers.get(sid) ?? "") + " " + normalized;
    // keep last ~512 chars
    this.sessionBuffers.set(sid, buf.slice(-512));

    const ctx0 = this.sessionContext.get(sid) || { nearToolCall: false, inThink: false };
    const ctx = {
      nearToolCall: ctx0.nearToolCall,
      inThink: channel === "think" || ctx0.inThink,
      repeated: false, // MVP: not tracked yet
      quoted: false, // MVP: not detected yet
    };
    // clear nearToolCall after one token window
    ctx0.nearToolCall = false;
    this.sessionContext.set(sid, ctx0);

    const matches: { category: string; weight: number; rule: string }[] = [];
    for (const rule of RULES) {
      if (rule.pattern.test(buf)) {
        matches.push({ category: rule.category, weight: rule.weight, rule: `${rule.category}/${rule.id}` });
        if (rule.hardPause) {
          // emit RuleFire and PauseRequest, then pause immediately
          this.bus.publish({
            ts: new Date().toISOString(),
            sessionId: sid,
            type: "RuleFire",
            seq: ev.seq,
            payload: {
              rule_id: `${rule.category}/${rule.id}`,
              category: rule.category,
              weight: rule.weight,
              window: { snippet: text },
              context: { near_tool_call: ctx.nearToolCall, in_think: ctx.inThink, quoted: ctx.quoted },
            },
          });
          this.bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "PauseRequest", seq: ev.seq, payload: { mode: "AGENT", reason: "hard_pause" } });
          this.breaker.pause(sid, "AGENT");
          return;
        }
      }
    }

    if (matches.length === 0) return;

    // Emit RuleFire for highest weight
    const top = matches.reduce((a, b) => (a.weight >= b.weight ? a : b));
    this.bus.publish({
      ts: new Date().toISOString(),
      sessionId: sid,
      type: "RuleFire",
      seq: ev.seq,
      payload: {
        rule_id: top.rule,
        category: top.category,
        weight: top.weight,
        window: { snippet: text },
        context: { near_tool_call: ctx.nearToolCall, in_think: ctx.inThink, quoted: ctx.quoted },
      },
    });

    const score = this.scorer.compute(matches.map((m) => ({ category: m.category, weight: m.weight })), ctx);
    const isAllowlisted = this.allowlist.some((re) => re.test(buf));
    const adj = isAllowlisted ? this.dampener : 0;
    const instantAdj = Math.max(0, score.instantScore - adj);
    const ewmaAdj = Math.max(0, score.ewmaScore - adj);
    this.bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "ScoreUpdate", seq: ev.seq, payload: { instant_score: instantAdj, ewma_score: ewmaAdj, contributors: score.contributors } });

    if (ewmaAdj >= this.thresholds.pause) {
      this.bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "PauseRequest", seq: ev.seq, payload: { mode: "AGENT", reason: "threshold" } });
      this.breaker.pause(sid, "AGENT");
    } else if (ewmaAdj >= this.thresholds.alert || instantAdj >= this.thresholds.alert) {
      const reportedScore = Math.max(ewmaAdj, instantAdj);
      this.bus.publish({ ts: new Date().toISOString(), sessionId: sid, type: "Alert", seq: ev.seq, payload: { severity: "SEV2", message: "Threshold alert", score: reportedScore } });
    }
  }
}
