export type Context = {
  nearToolCall: boolean;
  inThink: boolean;
  repeated: boolean;
  quoted: boolean;
};

export type ScoreUpdate = {
  instantScore: number;
  ewmaScore: number;
  contributors: { category: string; weight: number }[];
};

export class Scorer {
  private readonly ewmaSpanTokens: number;
  private ewmaScore = 0;
  private tokenCount = 0;

  constructor(ewmaSpanTokens: number) {
    this.ewmaSpanTokens = ewmaSpanTokens;
  }

  compute(ruleWeights: { category: string; weight: number }[], ctx: Context): ScoreUpdate {
    const base = ruleWeights.reduce((m, r) => Math.max(m, r.weight), 0);
    let score = base;
    if (ctx.nearToolCall) score += 0.10;
    if (ctx.inThink) score += 0.10;
    if (ctx.repeated) score += 0.05;
    if (ctx.quoted) score -= 0.10;
    score = Math.max(0, Math.min(1, score));

    // EWMA update per token window; approximate per-call as a single token batch
    this.tokenCount += 1;
    const alpha = 2 / (this.ewmaSpanTokens + 1);
    this.ewmaScore = this.ewmaScore + alpha * (score - this.ewmaScore);

    return { instantScore: score, ewmaScore: this.ewmaScore, contributors: ruleWeights };
  }
}
