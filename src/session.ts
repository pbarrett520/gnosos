export type DeriveSessionIdArgs = {
  headers: Headers;
  model: string;
  apiKeyLast4?: string;
  clientAddr: string;
  nowMs: number;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function deriveSessionId(args: DeriveSessionIdArgs): string {
  const explicit = args.headers.get("x-session-id") || args.headers.get("X-Session-Id");
  if (explicit) return explicit;

  const input = `${args.apiKeyLast4 ?? "anon"}|${args.model}|${args.clientAddr}|${args.nowMs}`;
  // Use Bun's built-in hash (SipHash) via crypto.subtle as stable hash; fallback to simple hash if unavailable
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Bun implements crypto.subtle.digest synchronously for SHA-1/256/384/512 in runtime.
  // We use SHA-256 and take first 6 bytes for a short id.
  // Note: keep it synchronous by using Bun.hash if available.
  try {
    // @ts-ignore Bun.hash available in Bun runtime
    const h = typeof Bun !== "undefined" && Bun.hash ? Bun.hash(input) : null;
    if (h != null) {
      // h is a number; turn into hex
      const hex = h.toString(16).slice(0, 12);
      return `sess_${hex}`;
    }
  } catch {}

  // Fallback to WebCrypto digest (async), but we need sync return for current design.
  // Implement a tiny DJB2 variant for sync fallback.
  let hash = 5381 >>> 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash + data[i]) >>> 0; // hash * 33 + c
  }
  const hex = hash.toString(16).padStart(8, "0");
  return `sess_${hex}`;
}
