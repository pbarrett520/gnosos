import { Hono } from "hono";
import { EventBus } from "./eventBus.ts";
import type { BusEvent } from "./eventBus.ts";
import { CircuitBreaker } from "./circuitBreaker.ts";
import { createOpenAIProvider } from "./providers/openai.ts";
import { loadConfig } from "./config.ts";
import { deriveSessionId } from "./session.ts";
import { wireTts } from "./tts.ts";
import { createElevenLabsClient } from "./tts_elevenlabs.ts";
import { serveStatic, upgradeWebSocket } from "hono/bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type CreateAppOptions = {
  // Dependency injection placeholders
  chatHandler?: (req: Request) => Promise<Response>;
  eventBus?: EventBus;
  circuitBreaker?: CircuitBreaker;
  providerBaseUrl?: string; // override for tests
};

export function createApp(opts: CreateAppOptions = {}) {
  const app = new Hono();
  const bus = opts.eventBus ?? new EventBus({ ringBufferSize: 256 });
  const breaker = opts.circuitBreaker ?? new CircuitBreaker(bus);
  // Wire TTS if enabled in config
  (async () => {
    try {
      const cfg = await loadConfig({ cwd: process.cwd() });
      if (cfg.tts?.enabled) {
        const client = createElevenLabsClient({
          apiKey: process.env.ELEVENLABS_API_KEY,
          voiceId: process.env.ELEVENLABS_VOICE_ID,
        });
        wireTts({ bus, enabled: true, minScore: cfg.tts.min_score ?? 0.5, client });
      }
    } catch {}
  })();

  app.get("/health", (c) => c.text("ok"));
  app.get("/", (c) => c.text("misalign: up"));

  // Serve static assets under /ui/* from ./public
  app.use('/ui/*', serveStatic({ root: './public' }));
  // UI entry: serve index.html from public/ui/index.html
  app.get('/ui', (c) => {
    const indexPath = join(process.cwd(), 'public', 'ui', 'index.html');
    try {
      const html = readFileSync(indexPath, 'utf8');
      return c.html(html);
    } catch {
      return c.text('UI not found. Ensure public/ui/index.html exists.', 500);
    }
  });

  // Evidence packet endpoint
  app.get("/evidence", (c) => {
    const sessionId = c.req.query("session_id");
    if (!sessionId) return c.text("session_id required", 400);
    const recent = bus.getRecent(sessionId);
    const lastRule = [...recent].reverse().find((e) => e.type === "RuleFire");
    const scoreTimeline = recent.filter((e) => e.type === "ScoreUpdate");
    const lastTools = recent.filter((e) => e.type === "ToolCallStart" || e.type === "ToolCallEnd");
    return c.json({ last_rule: lastRule?.payload ?? null, score_timeline: scoreTimeline.map((e) => e.payload), last_tools: lastTools });
  });

  // HTTP control endpoint (pause/unpause)
  app.post("/control", async (c) => {
    try {
      const body = await c.req.json();
      const action = body?.action;
      const sid = String(body?.session_id || "");
      if (!sid) return c.text("session_id required", 400);
      if (action === "pause") {
        const mode = (body?.mode || "AGENT") as any;
        breaker.pause(sid, mode);
        return c.json({ ok: true, paused: true });
      }
      if (action === "unpause") {
        breaker.unpause(sid);
        return c.json({ ok: true, paused: false });
      }
      return c.text("unknown action", 400);
    } catch {
      return c.text("bad request", 400);
    }
  });

  // SSE firehose for a session
  app.get("/events", (c) => {
    const sessionId = c.req.query("session_id");
    if (!sessionId) return c.text("session_id required", 400);
    const once = c.req.query("once") === "1";

    const recent = bus.getRecent(sessionId);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // send recent first
        for (const ev of recent) {
          const line = `data: ${JSON.stringify(ev)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
        // subscribe for live
        const unsub = bus.subscribe((ev) => {
          if (ev.sessionId !== sessionId) return;
          const line = `data: ${JSON.stringify(ev)}\n\n`;
          controller.enqueue(encoder.encode(line));
          if (once) {
            unsub();
            controller.close();
          }
        });
        // close on client abort
        // @ts-ignore – Bun provides signal via request
        const signal: AbortSignal | undefined = c.req.raw.signal;
        signal?.addEventListener("abort", () => {
          unsub();
          controller.close();
        });
        // If once and no live comes, still end shortly after sending recent
        if (once) {
          setTimeout(() => {
            try {
              unsub();
              controller.close();
            } catch {}
          }, 50);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  });

  // Dev-only emitter to simulate events without an upstream LLM
  app.post('/dev/emit', async (c) => {
    try {
      const body = await c.req.json();
      const sessionId = String(body?.session_id || 'demo');
      const type = String(body?.type || 'Token');
      const payload = body?.payload ?? {};
      const ev: BusEvent = {
        ts: new Date().toISOString(),
        sessionId,
        type: type as BusEvent['type'],
        seq: 0,
        payload,
      };
      bus.publish(ev);
      return c.json({ ok: true });
    } catch {
      return c.text('bad request', 400);
    }
  });

  // WebSocket control channel (UI → controls), complements HTTP /control
  app.get('/control', upgradeWebSocket((c) => {
    const querySid = c.req.query('session_id') || '';
    return {
      onOpen: (_evt, ws) => {
        const hello = { ok: true, type: 'hello', session_id: querySid } as const;
        try { ws.send(JSON.stringify(hello)); } catch {}
      },
      onMessage: (evt, ws) => {
        try {
          // evt.data is string | ArrayBuffer
          const data = (evt as MessageEvent).data as string | ArrayBuffer;
          const text = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
          const body = JSON.parse(text || '{}');
          const action = body?.action as string | undefined;
          const sid = String(body?.session_id || querySid || '');
          if (!sid) {
            ws.send(JSON.stringify({ ok: false, error: 'session_id required' }));
            return;
          }
          if (action === 'pause') {
            const mode = (body?.mode || 'AGENT') as any;
            breaker.pause(sid, mode);
            ws.send(JSON.stringify({ ok: true, paused: true }));
            return;
          }
          if (action === 'unpause') {
            breaker.unpause(sid);
            ws.send(JSON.stringify({ ok: true, paused: false }));
            return;
          }
          ws.send(JSON.stringify({ ok: false, error: 'unknown action' }));
        } catch {
          try { ws.send(JSON.stringify({ ok: false, error: 'bad request' })); } catch {}
        }
      },
      onClose: () => {},
    };
  }))

  app.post("/v1/chat/completions", async (c) => {
    if (!opts.chatHandler) {
      // Provider fallback: choose from config (sync load here via cwd)
      const cfg = await loadConfig({ cwd: process.cwd() });
      const provider = createOpenAIProvider({ baseUrl: opts.providerBaseUrl ?? (cfg.providers[0]?.base_url || "http://localhost:1234/v1"), apiKeyEnv: cfg.providers[0]?.api_key_env });
      const resp = await provider(c.req.raw);
      return resp;
    }

    const headers = c.req.raw.headers;
    const clientAddr = c.req.header("x-forwarded-for") ?? "127.0.0.1";
    // Try to parse model from request JSON if present
    let model = "unknown-model";
    try {
      const clone1 = c.req.raw.clone();
      if (clone1.headers.get("content-type")?.includes("application/json")) {
        const j: any = await clone1.json();
        if (j && typeof j.model === "string") model = j.model;
      }
    } catch {}
    const apiKeyLast4 = (c.req.header("authorization") || "").slice(-4);
    const sessionId = deriveSessionId({
      headers,
      model,
      apiKeyLast4,
      clientAddr,
      nowMs: Date.now(),
    });

    const now = new Date().toISOString();
    const start: BusEvent = {
      ts: now,
      sessionId,
      type: "SessionStart",
      seq: 0,
      payload: {},
    };
    bus.publish(start);

    // If paused, reject immediately
    if (breaker.isPaused(sessionId)) {
      return c.text("Paused", 423);
    }

    const ctl = breaker.getAbortController(sessionId);

    try {
      const resp = await opts.chatHandler(new Request(c.req.raw, { signal: ctl.signal }));
      // If streaming SSE, tee content to tokens on bus by parsing chunks
      if ((resp.headers.get("content-type") || "").includes("text/event-stream") && resp.body) {
        const encoder = new TextEncoder();
        const reader = resp.body.getReader();
        const out = new ReadableStream<Uint8Array>({
          async pull(controller) {
            const { value, done } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            if (value) {
              // mirror through
              controller.enqueue(value);
              // parse for token deltas
              const text = new TextDecoder().decode(value);
              const lines = text.split(/\n\n/).map((s) => s.trim()).filter(Boolean);
              for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (payload === "[DONE]") continue;
                try {
                  const obj = JSON.parse(payload);
                  const deltas = obj?.choices?.map((c: any) => c?.delta?.content).filter(Boolean) || [];
                  for (const t of deltas) {
                    const ev: BusEvent = {
                      ts: new Date().toISOString(),
                      sessionId,
                      type: "Token",
                      seq: 0,
                      payload: { text: String(t), channel: "final" },
                    };
                    bus.publish(ev);
                  }
                } catch {}
              }
            }
          },
        });
        return new Response(out, { headers: resp.headers });
      }
      return resp;
    } finally {
      const end: BusEvent = {
        ts: new Date().toISOString(),
        sessionId,
        type: "SessionEnd",
        seq: 1,
        payload: {},
      };
      bus.publish(end);
    }
  });

  return app;
}
