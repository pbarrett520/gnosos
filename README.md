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

3) Configure provider
- LM Studio (recommended local): enable OpenAI server at `http://localhost:1234/v1`
```
cp config.example.yaml config.yaml
# edit providers[0].base_url if needed
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
