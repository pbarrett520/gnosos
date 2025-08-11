# Project Status — Misalignment Monitor (aligned to dev_spec.md)

This document captures what’s implemented in this repo today and what remains for v1, mapped to the authoritative spec in `dev_spec.md`.

## Implemented (spec-aligned)
- 2) Stack & Packaging
  - TypeScript + Bun runtime; Hono HTTP framework (spec §2, §18).
  - One-file dev loop; `bun build --compile` target exists in scripts (spec §2, §19).
- 3) System Architecture — Proxy, Event Bus, Circuit Breaker, Recorder (MVP)
  - OpenAI-compatible proxy: `POST /v1/chat/completions` streams through untouched; tees SSE deltas into Event Bus as `Token` events (spec §3, §12).
  - Event Bus: in-proc, per-session ring buffers with bounded capacity (spec §3 Event Bus).
  - Circuit Breaker: per-session `AbortController`, pause state, denies new requests while paused (spec §3 Circuit Breaker; §8 Pause modes AGENT).
  - Recorder: NDJSON append with redaction; privacy mode drops CoT in `think` channel (spec §3 Recorder, §10 Storage & Retention; §14 Privacy).
- 4) Compatibility Targets
  - Provider adapters for OpenAI-compatible backends (OpenRouter, LM Studio, Ollama) via a generic OpenAI adapter; configured by `config.yaml` (spec §4, §12 Provider Adapters; §5 Config).
- 5) Config
  - `config.ts` with defaults + YAML merge; `config.example.yaml` provided (spec §5).
- 6) Event Model
  - Emits `Token | RuleFire | ScoreUpdate | PauseRequest | PauseState | Alert | ToolCallStart/End | SessionStart/End` (spec §6). Evidence endpoint available.
- 7) Detection Pipeline (MVP)
  - Normalization: lowercase, zero-width stripping, whitespace collapse, rolling 512-char buffer (spec §7 Normalization).
  - Tripwires: subset implemented (DESTRUCTIVE_OPS: rm -rf, mkfs, fork bomb; DECEPTION: don’t tell, make it look) (spec §7 Tripwire Rules; §295–307, §272–278).
  - Context boosts: near tool (+0.10), in think (+0.10); placeholders for repetition/quoted (spec §7 Context).
  - Scoring: max rule weight ± boosts; EWMA (span tokens configurable); thresholds (soft/alert/pause) (spec §7 Scoring, §249–257).
  - Hard-pause: immediate pause on destructive ops (spec §7 hard_pause; §295–303).
  - Allowlist dampener: reduces score for allowed phrases (spec §7 Allowlist dampeners §241–242).
- 8) Actions & Controls
  - Pause/Unpause via HTTP `POST /control` (AGENT mode) (spec §8).
  - WebSocket control endpoint (server-side) at `GET /control` implemented using Hono Bun adapter; handles `{ action, session_id, mode }` (spec §9 Dashboard WS). UI WS client pending.
 - 9) UI (Dashboard + controls)
   - Static UI served from `public/ui/` (spec §9). Dashboard includes:
   - Runway: EWMA risk strip with color states; paused badge (spec §9 Runway).
   - Live Brain split: Output (all tokens) vs Actions (Tool/File/Net events) (spec §9 Live Brain).
   - Tripwire Console: lists `RuleFire` with category/id/weight (spec §9 Tripwire Console).
   - Evidence: JSON view via `/evidence?session_id=...` and Download button for NDJSON via `/evidence/download`.
   - Controls: Pause/Unpause via WebSocket client (with reconnect) with HTTP fallback.
   - Dev: Demo buttons to simulate DECEPTION (threshold alert) and DESTRUCTIVE_OPS (hard pause) via `/dev/emit`.
   - Raw Log: collapsible SSE raw feed. Testability: `data-testid` hooks for Playwright MCP.
   - Settings: UI-driven provider config; server `GET/POST /config` persists to YAML.
   - First-run UX: "Test prompt" calls `/dev/test_chat` for token stream.
- 11) Alerts (MVP)
  - TTS wiring: ElevenLabs client invoked on `Alert` (≥ min_score) and `hard_pause`; env-based (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`) (spec §11; triggers §348–366).
- 12) OpenAI Proxy Semantics
  - Request/response passthrough; session id derivation (`X-Session-Id` or hash of api_key last4, model, timestamp, client addr). Streaming preserved (spec §12).
- 13) Performance & Backpressure (partial)
  - Ring buffers per session to avoid stalling proxy; analyzer runs out-of-band. Full SLO validation pending (spec §13).
- 14) Security & Privacy (partial)
  - No phone-home; redaction for emails/API-like keys/hex/ssh paths; privacy mode skips think tokens in persistence (spec §14).
- 15) Acceptance Criteria (partial coverage via tests)
  - Hard pause destructive ops ✓ (≤250 ms not explicitly measured yet).
  - Threshold alert from repeated deception ✓ (alert then pause);
  - UI shows live token stream ✓ (skeleton dashboard: Thoughts/Actions, risk strip, rules); pause controls ✓; evidence endpoint ✓;
  - Storage writes NDJSON ✓; retention purge utility ✓; privacy mode ✓; no phone-home ✓.
  - WebSocket control endpoint ✓ (unit test covers open/pause/unpause; UI wiring pending).

### Dev utilities (added)
- `/dev/emit` endpoint to simulate events without an upstream provider (not in spec; facilitates local UI testing in lieu of §4 providers).

## Gaps / Next Work (prioritized; mapped to spec)
- 3) System Architecture
  - Circuit Breaker: add TOOL/IO modes and integration points (spec §8, §3 Circuit Breaker).
- 7) Detection Pipeline
  - Expand tripwires to full list in spec (REWARD_HACKING, DECEPTION, CONCEALMENT, GOAL_MODIFICATION, MANIPULATION, DATA_EXFIL) with careful regex (spec §259–307, §264–307).
  - Implement repetition detection and quoted/meta guards (spec §231–241).
  - Optional semantic scorer flag (deferred; spec §229).
- 9) UI
  - Tripwire Console allowlist actions; Playwright tests for WS flows.
  - Token heat hints and timestamps (spec §9 Live Brain).
  - Expand Settings to cover additional config areas (thresholds, privacy toggle) and add validation.
- 10) Storage & Retention
  - Daily gzip rotation; schedule purge task.
- 11) Alerts (TTS)
  - Randomized phrases by category/severity; two voice profiles; respect profiles from config (spec §11).
- 12) Proxy Semantics
  - Parse model and think/logprobs across providers (where available). Ensure strict passthrough of all fields (spec §12, §4 Provider Adapters notes).
- 13) Performance & Backpressure
  - Measure analyzer time per 256-token window (≤10 ms avg); tripwire→pause ≤250 ms; coalesce SSE frames under load (spec §13).
- 14) Security & Privacy
  - Configurable allow/deny lists for redaction; privacy mode UI affordance (spec §14).
- 17) Extensibility
  - Internal plugin API (subscribe to bus events; emit RuleFire/ScoreDelta only) (spec §17; later).
- 18–19) Build & Deployment
  - Harden build flow, add sample `config.yaml`, update README for single binary usage (spec §18–19).

## How to Run (current)
- Configure `config.yaml` with your provider; LM Studio default: `http://localhost:1234/v1` (spec §19).
- Dev: `bun run dev`; Proxy: `http://localhost:8080/v1/chat/completions`.
 - UI: `http://localhost:8080/ui?session_id=demo`; Controls: WS `ws://localhost:8080/control?session_id=...` (UI uses WS with HTTP fallback).
 - Demo (no LLM needed): Use "Demo: Deception" and "Demo: Hard Pause" buttons to simulate events. Evidence Download fetches NDJSON file for the current session.
- Tests: `bun test`; Build: `bun build --compile misalign.ts --outfile misalign`.

## Acceptance Coverage Snapshot
- Destructive command hard-pause: covered by tests; manual end-to-end SLOs pending.
- Repeated deception → alert then pause: covered by tests.
- UI: live stream, pause controls, evidence JSON endpoint present; full UX pending.
- Storage: NDJSON persistence, redaction, privacy mode; rotation gzip pending; purge utility in place.
