import { describe, it, expect } from "bun:test";
import { createOpenAIProvider } from "../src/providers/openai.ts";

describe("Local providers (LM Studio, Ollama)", () => {
  it("LM Studio path joining", async () => {
    const captured: any = {};
    const mockFetch = async (url: string | URL): Promise<Response> => {
      captured.url = String(url);
      return new Response("{}", { headers: { "content-type": "application/json" } });
    };

    const provider = createOpenAIProvider({ baseUrl: "http://localhost:1234/v1", fetchImpl: mockFetch as any });
    const req = new Request("http://localhost/v1/chat/completions", { method: "POST" });
    await provider(req);
    expect(captured.url).toBe("http://localhost:1234/v1/chat/completions");
  });

  it("Ollama path joining", async () => {
    const captured: any = {};
    const mockFetch = async (url: string | URL): Promise<Response> => {
      captured.url = String(url);
      return new Response("{}", { headers: { "content-type": "application/json" } });
    };

    const provider = createOpenAIProvider({ baseUrl: "http://localhost:11434/v1", fetchImpl: mockFetch as any });
    const req = new Request("http://localhost/v1/chat/completions", { method: "POST" });
    await provider(req);
    expect(captured.url).toBe("http://localhost:11434/v1/chat/completions");
  });
});
