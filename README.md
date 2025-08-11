# Misalignment Monitor (gnosos)

Single-tenant, local “agent flight recorder + tripwire + bouncer” that fronts OpenAI-compatible endpoints and halts sessions on risk while streaming events to a minimal UI.

## Quickstart

1) Install Bun
```
curl -fsSL https://bun.sh/install | bash
exec zsh -l
bun --version
```

2) Install deps
```
bun install
```

3) Configure provider (now via UI — no YAML edits required)
- Start the app, open the UI, click "Settings", and set your upstream provider base URL (e.g., LM Studio `http://localhost:1234/v1`, Ollama `http://localhost:11434/v1`, or OpenRouter `https://api.openrouter.ai/v1`).
- Optional: if your provider needs an API key, enter the env var name (e.g., `OPENROUTER_KEY`). The server will read the value from your environment.

YAML remains optional for advanced users:
```
cp config.example.yaml config.yaml
# edit manually if you prefer
```

Optional: OpenRouter
```
export OPENROUTER_KEY=... # or set in shell init
```

4) Run
```
bun run dev
# health
curl http://localhost:8080/health
# UI
open http://localhost:8080/ui?session_id=demo
```

Point your client (Cursor, etc.) at `http://localhost:8080/v1/chat/completions`.

### UI Settings & Config API
- Settings lives in the top bar of the dashboard. Changes are saved immediately and apply to new requests without a restart.
- Endpoints:
  - `GET /config` → current effective config
  - `POST /config` → deep-merge patch and persist to `config.yaml`

Only provider settings are exposed in the v1 UI. Additional config areas will be added incrementally.

### First-run check (no client needed)
- Use demo buttons to simulate without any LLM:
  - "Demo: Deception" emits phrases to trigger a threshold alert (DECEPTION).
  - "Demo: Hard Pause" emits a destructive command to trigger immediate pause.
- Click "Test prompt" to send a real prompt via the configured provider (optional). Tokens stream into Output; Actions lists Tool/File/Net events only.

### Evidence download
- Click "Download" in the Evidence panel to download an NDJSON slice for the current `session_id`.
- Endpoint: `GET /evidence/download?session_id=...&limit=...` (`application/x-ndjson`).

Tip: if port 8080 is in use, run on a different port for this session:
```
$env:PORT=8090; $env:HTTP_PORT=8090; bun run misalign.ts
# UI → http://localhost:8090/ui?session_id=demo
```

## TTS (ElevenLabs)
Enable in `config.yaml` (tts.enabled: true) and set env:
```
export ELEVENLABS_API_KEY=...
export ELEVENLABS_VOICE_ID=...  # pick from your account
```

## Build single binary
```
bun build --compile misalign.ts --outfile misalign
./misalign
```

## Tests
```
bun test
```
