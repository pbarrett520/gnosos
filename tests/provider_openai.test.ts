import { describe, it, expect, beforeEach } from "bun:test";
import { createOpenAIProvider } from "../src/providers/openai.ts";

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe("OpenAI provider adapter", () => {
  beforeEach(() => {
    delete (process.env as any).OPENROUTER_KEY;
  });

  it("uses API key from env when api_key_env is set", async () => {
    (process.env as any).OPENROUTER_KEY = "rk_test_123";

    const captured: { url?: string; headers?: Record<string, string>; body?: string } = {};
    const mockFetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      captured.url = String(url);
      captured.headers = Object.fromEntries((init?.headers as any) || []);
      captured.body = typeof init?.body === "string" ? (init?.body as string) : undefined;
      return new Response("{}", { headers: { "content-type": "application/json" } });
    };

    const provider = createOpenAIProvider({ baseUrl: "https://api.openrouter.ai/v1", apiKeyEnv: "OPENROUTER_KEY", fetchImpl: mockFetch as any });

    const req = new Request("http://localhost/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "x", messages: [] }) });
    const res = await provider(req);
    expect(res.status).toBe(200);
    expect(captured.url).toBe("https://api.openrouter.ai/v1/chat/completions");
    expect(captured.headers?.authorization).toBe("Bearer rk_test_123");
  });

  it("passes through streaming SSE responses", async () => {
    const chunks = [
      sseChunk({ choices: [{ delta: { content: "hi" } }] }),
      sseChunk({ choices: [{ delta: { content: "!" } }] }),
      "data: [DONE]\n\n",
    ];
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (!next) return controller.close();
        controller.enqueue(new TextEncoder().encode(next));
      },
    });

    const mockFetch = async (): Promise<Response> => new Response(upstream, { headers: { "content-type": "text/event-stream" } });

    const provider = createOpenAIProvider({ baseUrl: "https://example.com/v1", fetchImpl: mockFetch as any });
    const res = await provider(new Request("http://localhost/v1/chat/completions", { method: "POST" }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text.includes("data: [DONE]")).toBe(true);
  });
});
