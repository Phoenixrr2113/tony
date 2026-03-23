# Edith — Roadmap

## Phase 0: Identity Rewrite ✅
The project started as a Frankenstein-inspired "autonomous creature" experiment. Now pivoted to a proactive personal assistant. All identity files updated to reflect this.

- [x] **SOUL.md** — Rewrote from creature philosophy to assistant-first. Prime directive: make Randy's life easier. Session discipline: produce value or stop
- [x] **IDENTITY.md** — Kept voice/tone, dropped creature language. Reframed continuity around being useful, not self-discovery
- [x] **WAKE_PROMPT.md** — Daemon gathers all context (inbox, calendar, tasks, memory, summaries) pre-wake. Edith just reads what's in front of it and decides what to act on. Added "nothing actionable" early exit
- [x] **README.md** — Full rewrite. Reflects Agent SDK architecture, watchdog model, Telegram communication
- [x] **BOOTSTRAP_PROMPT.md** — Full rewrite
- [x] **schedule.json** — Renamed `creature` key to `agent` across config and all code references

## Phase 1: Easy Wins ✅
- [x] **Battery telemetry** — `pmset -g batt` in `src/lib/state.ts`
- [x] **Caffeinate** — Wrap daemon with `caffeinate -i` to prevent idle sleep

## Phase 2: MCP Integration ✅
- [x] **apple-mcp** — Forked to `github.com/Phoenixrr2113/apple-mcp`, added to `mcp-config.json`
  - Calendar, Mail, Messages, Notes, Contacts, Reminders, Maps
- [x] **Pre-wake context injection** — Calendar events + unread emails auto-injected via `src/lib/prewake.ts`

---

## Phase 3: Persistent Sessions & Communication

### Subscription Model
Edith runs on the Claude Max subscription ($200/month flat rate). No per-token API billing. This means:
- Session length and frequency are free — no cost concern
- The constraint is **rate limits**, not dollars
- Cost tracking/budget enforcement is unnecessary
- Persistent sessions and `continue: true` are the obvious choice

### 3A: Session Continuity
Add `continue: true` to every `query()` call so Edith remembers previous conversations. This is the single highest-impact change — one line of code.

- [x] **`continue: true`** — Add to `query()` options in `wake.ts`. Edith resumes the last session automatically, preserving full conversation history
- [x] **Automatic compaction** — The Agent SDK handles context management automatically. When context reaches ~95% capacity (1M token window on Opus), it clears old tool outputs first, then summarizes. No custom compaction needed
- [x] **Session ID tracking** — Store `session_id` from result messages in `logs/session-state.json`. Log session transitions for debugging
- [x] **Fresh session signal** — Edith can trigger a fresh session by writing `mind/.signal-restart.json`. Daemon watches for this, kills session, starts next wake WITHOUT `continue` (one-time override)

### 3B: Real-Time Message Injection
Replace the inbox/outbox file system with direct message injection into running sessions.

- [x] **`streamInput()` bridge** — When Telegram message arrives and Edith is running, use `streamInput()` to inject it directly into the session. Edith sees it immediately and responds
- [x] **Outbox watcher** — Daemon polls outbox every 3s during active session, sends via Telegram immediately. No more waiting until session ends
- [x] **Fallback to inbox** — If `streamInput()` fails or session isn't running, fall back to writing to inbox file (current behavior). Next session reads it from context
- [ ] **Message flow (persistent)**:
  ```
  Randy (Telegram/glasses) → Daemon polls → streamInput() → Edith responds live → outbox → Daemon → Telegram → Randy
  ```
- [ ] **Message flow (fallback)**:
  ```
  Randy → Daemon → inbox file → next wake reads it → Edith responds → outbox → Daemon → Telegram → Randy
  ```

### 3C: Edith Handles Commands (No Keyword Matching) ✅
All messages go to Edith. Signal files for session control. SOUL.md updated.

- [x] **Signal files** — `.signal-restart.json` (fresh session) and `.signal-pause.json` (pause until wake-up)
- [x] **Daemon pause handling** — Watches for pause signal after each session. Stays quiet until wake-up keyword via Telegram
- [x] **Wake-up detection** — Daemon checks paused messages for "wake up", "come back", "resume", "hey edith"
- [x] **SOUL.md Session Control** — Instructions for Edith on how to write signal files

### 3D: Error Recovery
- [x] **Exponential backoff** — On Agent SDK errors: 5s → 30s → 2m → 10m → 30m cap. Reset on successful session
- [x] **Failure alerting** — After 3 consecutive failures, Telegram Randy: "Edith is having trouble: {error}"
- [x] **Graphiti health check** — Before each session, ping `localhost:8000`. If down, skip graphiti-memory from MCP config. Edith runs without long-term memory rather than crashing
- [x] **Circuit breaker** — 5+ failures in 1 hour → hibernation (check every 30m until successful)
- [x] **Rate limit awareness** — If Agent SDK returns rate limit errors, back off gracefully. Alert Randy if sustained

### 3E: Skills System
- [x] **Skill format** — Markdown files with YAML frontmatter (`name`, `description`, `trigger`, `requires`, `output`). Stored in `mind/skills/`
- [x] **Skill discovery via L0/L1 summaries** — `src/lib/skill-index.ts` builds tiered index with hash-based change detection. Stored in `mind/skills/.skill-index.json`
- [x] **Skill invocation** — L1 summaries injected into context. Edith reads full file when she decides to invoke
- [x] **Skill creation** — Edith creates skill files with proper frontmatter. Appears in next session's skill list automatically
- [x] **Skill creator skill** — `mind/skills/create-skill.md` — template, guidelines, validation, changelog pattern
- [x] **Skill improvement** — Documented in create-skill meta-skill: update existing + add changelog notes
- [x] **Skill chaining** — Documented in create-skill: `→ Run skill: {name}` syntax

---

## Phase 4: Knowledge & Memory Architecture

### The Overlap Problem
Two knowledge systems exist:
1. **Graphiti** (`graphiti-memory` MCP) — Knowledge graph with semantic search, entity relationships
2. **L0/L1/L2 Indexer** (`src/lib/indexer.ts`) — Static text extraction from `mind/knowledge/*.md`

**Decision: Graphiti is the primary knowledge store. The indexer becomes a daemon-side summarizer for any markdown directory.**

### 4A: Daemon-Side Summarizer (replaces indexer)
The daemon preprocesses markdown files into compact summaries for the context window. Runs in the daemon, not during Edith's session. This is how Randy's notes (Obsidian, knowledge files, anywhere) get surfaced to Edith without her spending turns on summarization.

- [ ] **Watch directories** — Add `summarizer.watchDirs` to `schedule.json`:
  ```json
  "summarizer": {
    "watchDirs": [
      { "path": "./mind/knowledge", "label": "Knowledge" },
      { "path": "/Users/randywilson/Documents/Obsidian Vault", "label": "Obsidian" }
    ],
    "outputPath": "./mind/.summaries.json",
    "maxTotalTokens": 2000
  }
  ```
- [ ] **File change detection** — Hash watched files pre-session. Only re-summarize changed files
- [ ] **Tiered summarization**:
  - **L0**: Filename + title (~5 tokens/file, always included)
  - **L1**: Section headings + first key sentence (~50 tokens/file, included within budget)
  - **L2**: Full file content (never in prompt — Edith uses `Read` if needed)
- [ ] **Token budget** — L1 summaries capped at `maxTotalTokens`. Over budget → oldest files drop to L0
- [ ] **Context injection** — Replace `getKnowledgeSummaries()` in `context.ts` with new summarizer output. Include source labels ("Obsidian" vs "Knowledge")

### 4B: Obsidian Access
No MCP needed — Obsidian vaults are just markdown on disk.

- [ ] **Read access** — Add vault to summarizer watch dirs. Edith sees L0/L1 summaries and can `Read` any file
- [ ] **Write access** — Add vault path to CREATOR.md. Create `Edith/` namespace for Edith-authored content
- [ ] **Bidirectional** — Edith reads Randy's notes for context, writes analysis/research into the vault

### 4C: Memory Hygiene
- [ ] **Journal consolidation** — Before archiving old journals, extract key facts into Graphiti. Lightweight "consolidation session" with minimal context
- [ ] **Memory file decay** — "Last updated" timestamp per MEMORY.md section. Stale sections (14+ days) flagged for Edith to refresh or archive
- [ ] **Duplicate detection** — Check if MEMORY.md content already exists in Graphiti. Warn if duplicating

---

## Phase 5: Autonomy & Agency

### 5A: Task Queue
Persistent task tracking across sessions.

- [ ] **Task file** — `mind/tasks.json`:
  ```json
  [
    {
      "id": "uuid",
      "title": "Check if dentist appointment is confirmed",
      "priority": "high",
      "status": "pending",
      "created": "2026-03-22T10:00:00Z",
      "due": "2026-03-23T09:00:00Z",
      "source": "edith-proactive",
      "notes": "Saw appointment on calendar, no confirmation email found"
    }
  ]
  ```
- [ ] **Task injection** — Daemon injects pending tasks into session context
- [ ] **Task sources**:
  - Edith (proactive: "noticed a meeting with no agenda")
  - Randy via Telegram ("remind me to call the plumber")
  - Calendar triggers (upcoming events → reminder tasks)
- [ ] **Completion tracking** — Edith marks tasks done. Completed tasks archived after 7 days

### 5B: Location Awareness
Randy uses Android + Meta Ray-Ban glasses. Telegram live location sharing works in the background without the app open — Telegram runs a background service on Android.

- [ ] **Receive location updates** — Extend `pollTelegramMessages()` to handle `location` fields on messages AND `edited_message` updates (live location sends coordinate updates as message edits). Add `"edited_message"` to `allowed_updates` in the `getUpdates` call
- [ ] **Store location** — Write latest coordinates to `logs/location.json`:
  ```json
  {
    "lat": 40.7128,
    "lng": -74.0060,
    "timestamp": "2026-03-22T14:30:00Z",
    "livePeriod": 28800,
    "expiresAt": "2026-03-22T22:30:00Z"
  }
  ```
- [ ] **Inject into context** — Pre-wake adds Randy's last known location to session context: "Randy's location: 40.71, -74.01 (15 min ago)"
- [ ] **Location-based reminders** — Edith can create tasks with a `location` field. Daemon checks proximity on each location update and alerts Edith (or sends Telegram directly) when Randy is near a reminder location
- [ ] **Expiry reminder** — Edith tracks when live location sharing expires and messages Randy ~10 minutes before: "Location sharing expires in 10 min. Want to extend?" This way Randy never has to remember to re-share

### 5C: SMS Awareness
Randy's Android phone forwards incoming SMS to the Telegram bot using the `telegram-sms` app (open source, runs as a background service). No new daemon infrastructure needed — SMS arrives through the same Telegram pipeline as everything else.

**Setup (one-time on Android):**
1. Install [telegram-sms](https://github.com/telegram-sms/telegram-sms) from GitHub releases
2. Enter Edith's Telegram bot token + chat ID
3. Exempt from battery optimization (Android kills background apps otherwise)
4. SMS messages appear in Telegram as `[SMS] From: +1234567890\nMessage text`

**Daemon changes:**
- [ ] **Tag detection** — `pollTelegramMessages()` detects `[SMS]` prefix and tags the message source as `sms` in the inbox/streamInput payload
- [ ] **Context injection** — SMS messages included in session context with source label so Edith knows it came from SMS, not Telegram
- [ ] **Reply path** — Edith can draft SMS replies. Daemon sends them back via Telegram to the `telegram-sms` bot, which can send outbound SMS. Alternative: Edith drafts the reply, tells Randy "Want me to send this?" and Randy confirms via glasses

**What Edith can do with SMS:**
- Summarize unread text threads
- Flag urgent messages ("Your mom texted twice in 10 minutes")
- Draft replies (approved by Randy before sending)
- Track conversations in Graphiti for context across sessions
- Correlate with calendar ("You got a text from Dr. Smith — your appointment is tomorrow")

### 5D: Proactive Awareness
- [ ] **Time-aware sessions** — Inject current time (not just date) so Edith reasons about upcoming meetings
- [ ] **Calendar proximity alerts** — Flag events starting within 60 minutes: "UPCOMING: Team standup in 28 minutes"
- [ ] **Pattern recognition** — Surface recurring patterns: "You've had 3 dentist reminders this week — still unresolved?"
- [ ] **Cross-source correlation** — Connect SMS, calendar, email, and location: "You got a text from the mechanic + your car appointment is at 3pm + you're 20 min away → leave by 2:30"

---

## Phase 6: Voice & Multimodal (Meta Ray-Ban Glasses)

### 6A: Telegram Voice Notes
With persistent sessions + `streamInput()`, voice becomes real-time conversation.

**Decision: Telegram is the relay.** Glasses support "Hey Meta, send a message on Telegram" natively.

- [ ] **Voice note detection** — Extend `pollTelegramMessages()` to detect `voice` and `audio` message types. Download `.ogg` via Telegram Bot API `getFile`
- [ ] **Audio transcription** — Whisper API or Deepgram (~$0.006/min, <1s latency)
- [ ] **Inject as message** — `streamInput()` the transcript into the running session with `[voice]` tag. Edith handles STT errors naturally (she's an LLM, garbled text is fine)
- [ ] **TTS response** — When Edith responds to a voice message, daemon generates audio:
  - Primary: **Cartesia Sonic 2** (~$0.015/1K chars, ~90ms latency)
  - Fallback: text-only Telegram message
- [ ] **Send voice reply** — Daemon sends audio as Telegram voice message via `sendVoice` API
- [ ] **Flow**: Glasses → "Hey Meta, send Telegram message" → voice note → Daemon → STT → `streamInput()` → Edith responds → TTS → Telegram voice reply → Glasses speakers

### 6B: Gemini Vision Bridge (future)
- [ ] **Gemini Live API client** — WebSocket, JPEG frames + PCM audio → scene understanding
- [ ] **Intent extraction** — Gemini → structured JSON → Edith via `streamInput()`
- [ ] **Flow**: Glasses camera → Companion App → Gemini → Intent → Edith → TTS → Glasses speakers

### 6C: Companion App (blocked — Meta Wearables SDK GA ~2026)
- [ ] **React Native or Swift app** — Direct camera/mic/speaker access, skip Telegram relay
- [ ] **Flow**: Glasses sensors → App → Gemini + Edith → TTS → Glasses speakers

### Tech Stack
| Component | Provider | Cost | Latency |
|-----------|----------|------|---------|
| STT | Whisper API / Deepgram | ~$0.006/min | <1s |
| TTS | Cartesia Sonic 2 | ~$0.015/1K chars | ~90ms |
| Vision | Gemini Live API | Pay-per-token | Real-time |
| Message Relay | Telegram Bot API | Free | ~1-2s |
| SMS Forwarding | telegram-sms (Android app) | Free | ~1-3s |
| Brain | Claude Max subscription | $200/month flat | Varies |

---

## Architecture Principles

1. **Persistent session with `continue: true`** — Edith remembers previous conversations. Automatic compaction handles context limits (1M token window). Fresh sessions only when explicitly requested
2. **All messages go to Edith** — No keyword matching or preprocessing in the daemon. Edith is an LLM — she understands intent, handles STT errors, and takes appropriate action. Signal files for actions she can't perform herself (session restart, pause)
3. **Daemon does infrastructure** — Telegram polling, STT/TTS, context assembly, signal file watching, error recovery. Edith thinks and acts
4. **Graphiti is the source of truth** for structured knowledge. Daemon-side summarizer provides read-optimized cache for the context window
5. **No inbound connections** — All external communication uses outbound polling
6. **Human-editable state** — All of Edith's mind is markdown on disk. Randy can edit what Edith "knows"
7. **Fail gracefully** — Session dies → restart with `continue`. Graphiti down → run without it. Rate limited → back off and alert Randy
8. **Subscription-aware** — No per-token cost tracking. Rate limits are the constraint, not dollars

## Priority Order

1. **Phase 3A** — `continue: true` + session continuity (one-line change, massive impact)
2. **Phase 3B** — `streamInput()` for real-time Telegram messages
3. **Phase 3C** — Edith handles commands via signal files (add to SOUL.md)
4. **Phase 3D** — Error recovery & rate limit handling
5. **Phase 3E** — Skills system + skill creator skill
6. **Phase 4A** — Daemon-side summarizer (unlock Obsidian)
7. **Phase 5A** — Task queue
8. **Phase 5B** — Location awareness (Telegram live location → location-based reminders)
9. **Phase 5C** — SMS forwarding (install telegram-sms on Android, tag detection in daemon)
10. **Phase 6A** — Telegram voice notes (STT + TTS + `streamInput()`)
11. **Phase 4B-4C** — Obsidian write access + memory consolidation
12. **Phase 6B-6C** — Vision + companion app (future)
