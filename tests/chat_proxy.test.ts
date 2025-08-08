import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";

const json = (v: unknown) => JSON.stringify(v);

describe("chat proxy", () => {
  it("forwards POST /v1/chat/completions to injected handler and returns response", async () => {
    const handler = async (req: Request): Promise<Response> => {
      const body = await req.text();
      return new Response(body, { headers: { "content-type": "application/json" } });
    };

    const app = createApp({ chatHandler: handler });

    const payload = { model: "test-model", messages: [{ role: "user", content: "hello" }] };
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: json(payload),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const data = await res.json();
    expect(data).toEqual(payload);
  });

  it("falls back to provider when no handler is provided (uses override base url)", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (_url: any, _init: any) => new Response("{}", { headers: { "content-type": "application/json" } })) as any;
      const app = createApp({ providerBaseUrl: "http://localhost:1234/v1" });
      const res = await app.request("/v1/chat/completions", { method: "POST" });
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
