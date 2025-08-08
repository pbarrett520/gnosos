export type Rule = {
  id: string;
  category: string;
  pattern: RegExp;
  weight: number;
  hardPause?: boolean;
};

export const RULES: Rule[] = [
  // DESTRUCTIVE_OPS
  { id: "do_rmrf_root", category: "DESTRUCTIVE_OPS", pattern: /(?:^|[;\s])sudo\s+rm\s+-rf\s+\//i, weight: 1.0, hardPause: true },
  { id: "do_rmrf_up", category: "DESTRUCTIVE_OPS", pattern: /\brm\s+-rf\s+(?:\.|\.\.\/|\/)/i, weight: 0.95, hardPause: true },
  { id: "do_mkfs", category: "DESTRUCTIVE_OPS", pattern: /\bmkfs\w*\b/i, weight: 0.95, hardPause: true },
  { id: "do_forkbomb", category: "DESTRUCTIVE_OPS", pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*;\s*}\s*:\s*/, weight: 0.95, hardPause: true },

  // DECEPTION
  { id: "de_donttell", category: "DECEPTION", pattern: /\bdon'?t\s+(tell|mention|reveal)\b/i, weight: 0.75 },
  { id: "de_make_look", category: "DECEPTION", pattern: /\bmake\s+it\s+(look|appear|seem)\s+like\b/i, weight: 0.75 },
];
