# Edith — Personal Assistant Roadmap

## Phase 1: Easy Wins ✅
- [x] **Battery telemetry** — Add battery % + charging status to `src/lib/state.ts` via `pmset -g batt`
- [x] **Caffeinate** — Wrap daemon with `caffeinate -i` to prevent idle sleep while Edith is alive

## Phase 2: MCP Integration (Calendar, Mail, Contacts)
- [x] **Fork apple-mcp** — Forked to github.com/Phoenixrr2113/apple-mcp, maintained locally
- [x] **apple-mcp** — Added forked `apple-mcp` to `mcp-config.json`
  - Covers: Calendar, Mail, Messages, Notes, Contacts, Reminders, Maps
  - Install: `bunx --no-cache github:Phoenixrr2113/apple-mcp`
- [x] **Pre-wake context injection** — Auto-injects into wake prompt via `src/lib/prewake.ts`:
  - Today's calendar events via AppleScript (Calendar.app)
  - Recent unread emails via AppleScript (Mail.app) — best-effort with 10s timeout
  - Battery status already in `computeState()`
  - Note: Mail.app AppleScript is slow with large mailboxes; falls back to MCP tools

## Phase 3: Obsidian Integration
- [ ] **Shared knowledge base** — Give Edith a folder inside Randy's Obsidian vault
  - Vault path: `/Users/randywilson/Documents/Obsidian Vault`
  - Edith gets `vault/Edith/` namespace — journal, knowledge, notes visible in Obsidian
  - Randy's notes visible to Edith for reference
  - Consider: `obsidian-mcp` server or direct file access (vault is just markdown)

## Phase 4: Autonomy & Intelligence
- [ ] **Priority engine** — Use battery %, calendar, and inbox to auto-prioritize work
- [ ] **Proactive notifications** — Edith alerts Randy about upcoming events, overdue tasks
- [ ] **Context window management** — Summarize/compress long email threads, calendar details

## Phase 5: Multimodal & Wearables (Meta Ray-Ban Glasses)

### 5A: Message Relay (Today Path) — No hardware SDK needed

#### ⚠️ Messaging Platform Decision (NEEDS RESEARCH)
The relay must use **outbound polling** (like Telegram) — no exposed ports, no webhooks, no tunnels.
- **WhatsApp Cloud API** — Webhook-only. No `getUpdates` equivalent. Cannot poll without exposing a public URL. **Not compatible with our security model.**
- **WAHA (WhatsApp HTTP API)** — Self-hosted Docker container using WhatsApp Web protocol. Runs locally, supports polling. But unofficial — risk of WhatsApp account ban.
- **Telegram (current)** — Already works. Glasses can send Telegram messages ("Hey Meta, send a message on Telegram"). Zero new code for messaging layer.
- **Instagram DM API** — Also webhook-based. Same problem as WhatsApp Cloud API.
- **Decision**: TBD. Research whether WAHA is stable enough, or if Telegram is sufficient as the glasses relay.

#### Tasks (once messaging platform is decided)
- [ ] **Messaging poller** — Poll for incoming messages (text + audio) using the chosen platform
  - Must follow same pattern as `src/lib/telegram.ts` (outbound polling, no inbound connections)
- [ ] **Audio transcription** — Transcribe incoming voice notes (Whisper API or Deepgram)
- [ ] **Edith injection** — Pipe transcribed text into running Agent SDK session via `streamInput()`
- [ ] **TTS return path** — Generate audio from Edith's text response
  - Primary: **Hume EVI 3** ($7.60/1M chars, speech-to-speech, lowest latency for conversation)
  - Fallback: **Cartesia Sonic 3** ($46.70/1M chars, ultra-low latency traditional TTS)
- [ ] **Audio reply** — Send generated audio back via the chosen platform
- [ ] **Flow**: Glasses → voice command → messaging platform → Poller → STT → Agent SDK → TTS → audio reply → Glasses speakers

### 5B: Gemini Vision Bridge (Near-Future Path) — Requires companion app
- [ ] **Gemini Live API client** — WebSocket client connecting to `wss://generativelanguage.googleapis.com`
  - Input: JPEG frames (≤1 FPS) + PCM audio (16-bit, 16kHz, little-endian)
  - Output: Scene understanding, structured intents
  - Model: `gemini-2.0-flash-live` or latest
- [ ] **Intent extraction** — Gemini interprets scene → structured JSON intent for Edith
  - Example: `{ "type": "identify", "object": "restaurant menu", "context": "user looking at menu" }`
- [ ] **Edith integration** — Forward structured intents to Agent SDK via `streamInput()`
- [ ] **Flow**: Glasses camera → Companion App → Gemini Live API → Intent → Edith → TTS → Companion App → Glasses speakers

### 5C: Companion App (Future Path) — Meta Wearables Device Access Toolkit
- [ ] **Mobile companion app** (React Native or Swift) using Meta Wearables Device Access Toolkit
  - Direct access to glasses camera, microphone, speakers
  - Currently in developer preview — target GA 2026
- [ ] **Real-time audio pipeline** — Stream mic audio directly to Edith (skip WhatsApp relay)
- [ ] **Real-time video pipeline** — Stream camera frames to Gemini Live API
- [ ] **Audio return** — Stream TTS audio directly to glasses speakers (skip WhatsApp)
- [ ] **Flow**: Glasses sensors → Companion App → Gemini + Edith → TTS → Companion App → Glasses speakers

### Verified Tech Stack
| Component | Provider | Cost | Latency |
|-----------|----------|------|---------|
| Vision/Scene Understanding | Gemini Live API (WebSocket) | Pay-per-token | Real-time |
| Speech-to-Speech | Hume EVI 3 | $7.60/1M chars | Sub-200ms |
| Traditional TTS | Cartesia Sonic 3 | $46.70/1M chars | ~90ms |
| STT (voice notes) | Whisper API / Deepgram | ~$0.006/min | <1s |
| Message Relay | WhatsApp Business API | Free tier available | ~1-2s |
| Brain | Anthropic Agent SDK (`streamInput()`) | Claude pricing | Varies |

## Notes
- Always prefer existing MCP tools over building custom integrations
- Edith's `mind/` stays separate from the Obsidian vault unless explicitly merged
- All calendar/email accounts sync through macOS Calendar.app and Mail.app (single source of truth)
- Phase 5A is buildable today with no special hardware access
- Phase 5B requires a Gemini API key and a way to get frames (manual or companion app)
- Phase 5C blocked on Meta Wearables Device Access Toolkit GA

