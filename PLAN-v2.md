# Edith v2 — Redesign Plan

## What Changed

v1 was a polling loop: wake Edith every 60s, dump everything into her context, let her look around, repeat. It worked for proving the concept. But it's wasteful — most wakes find nothing to do — and the architecture doesn't scale as we add features.

v2 is **event-driven**. Edith only wakes when there's a reason: a scheduled brief, a message from Randy, a geofence trigger, or her own request. Between events, the daemon listens but Edith sleeps.

---

## Phase 7: Architecture Redesign

### 7A: Mind Directory Restructure

Current `mind/` is flat — SOUL.md, IDENTITY.md, CREATOR.md all at root, no separation between config and learned knowledge. Restructure:

```
tony/                            # Project root — Edith's cwd
├── .claude/
│   └── skills/                  # SDK-native skills (auto-discovered)
│       ├── code-delegation/
│       │   └── SKILL.md
│       └── .../
├── mind/
│   ├── soul/                    # Edith's "training" — loaded as system prompt
│   │   ├── SOUL.md              # Who she is, prime directive, boundaries (TINY)
│   │   ├── IDENTITY.md          # Voice, tone, continuity
│   │   ├── RANDY.md             # Everything about Randy (setup + preferences + learned)
│   │   └── config/
│   │       ├── protocols.md     # Message format, reminder logic, session control
│   │       └── locations.json   # Named places for geo-reminders
│   ├── knowledge/               # Things Edith learns (summarizer reads these)
│   │   └── *.md
│   ├── journal/                 # Session logs (date-stamped)
│   │   └── YYYY-MM-DD.md
│   ├── tasks.json               # Persistent task tracker
│   ├── reminders.json           # Location + time-based reminders
│   └── MEMORY.md                # Working memory (mid-term synthesis)
├── src/                         # Daemon code (Edith can read, not modify)
└── logs/                        # Daemon logs, transcripts, state
```

Changes:
- [x] Create `mind/soul/` and `mind/soul/config/` directories
- [x] Move SOUL.md → `mind/soul/SOUL.md` (trim to essentials: prime directive, boundaries, session discipline)
- [x] Move IDENTITY.md → `mind/soul/IDENTITY.md` (keep as-is)
- [x] Merge CREATOR.md into `mind/soul/RANDY.md` (setup + contact rules + learned preferences)
- [x] Create `mind/soul/config/protocols.md` — message format, quiet hours, reminder logic
- [x] Create `mind/soul/config/locations.json` — seeded with Randy's common places
- [x] Update `assembleSystemPrompt()` to load `soul/` + `soul/config/*`
- [x] Remove operational instructions from SOUL.md (move to protocols.md)
- [x] Update all path references in daemon code
- [x] **Change `cwd` from `mind/` to project root** — Edith gets codebase awareness
- [x] Update SOUL.md boundaries: "Your files are in `mind/`. Daemon code is in `src/`. You can read it but don't modify without Randy's approval."
- [x] **Adopt SDK native skills** — add `"Skill"` to `allowedTools`, add `settingSources: ["project"]`
- [x] Move skills from `mind/skills/` → `.claude/skills/` (SDK standard path)
- [x] Convert skill files to SDK format: `SKILL.md` with YAML frontmatter in subdirectories
- [x] **Delete custom skill system** — remove `src/lib/skill-index.ts`, `buildSkillIndex()`, `formatSkillsL1()`, skill index injection from context.ts
- [x] Delete `mind/skills/HOW_TO_SKILLS.md` (SDK handles discovery natively via progressive metadata loading)

### 7B: Event-Driven Daemon (Replace Wake Loop)

Replace the watchdog polling loop with an event scheduler + message router. The daemon stays alive 24/7 but only wakes Edith when there's a reason.

**Event types:**

| Event | Trigger | Brief type |
|-------|---------|------------|
| Morning brief | Scheduled (e.g. 8am) | Full: calendar, overnight msgs, tasks, state |
| Midday check | Scheduled (e.g. 12pm) | Light: new emails, calendar changes, task updates |
| Evening wrap | Scheduled (e.g. 5pm) | Wrap: summarize day, prep tomorrow, flag overnight |
| Message from Randy | Telegram message arrives | Just the message + minimal state |
| Geofence trigger | Location enters radius | Reminder text + location context |
| Edith-requested | She writes a schedule-request | Whatever she asked for |
| Voice note | Telegram voice message | Transcription + minimal state |
| SMS forwarded | telegram-sms message | The SMS content + context |

Changes:
- [x] Define brief types in `schedule.json`: `briefs: [{ name, time, type, enabled }]`
- [x] Create `src/lib/scheduler.ts` — cron-like scheduler that fires briefs at configured times
- [x] Create `src/lib/briefs.ts` — assembles the right prompt for each brief type
- [x] Refactor `daemon.ts` — replace `watchdogLoop()` with event loop: scheduler + telegram poller + geofence checker
- [x] Remove WAKE_PROMPT.md (replaced by brief templates in briefs.ts)
- [x] Keep `continue: true` — sessions persist across briefs
- [x] Keep `streamInput()` — messages inject into running sessions
- [x] Keep interruptible sleep — message triggers override schedule

**Brief content by type:**

Morning brief:
```
Good morning. It's {{DATE}}, {{DAY_OF_WEEK}}.
{{STATE}}
{{OVERNIGHT_MESSAGES}}
{{TODAY_CALENDAR}}
{{PENDING_TASKS}}
Check your email and flag anything important. Plan your day.
```

Message trigger:
```
{{MESSAGE}}
```

Geofence trigger:
```
📍 Randy is near {{LOCATION_NAME}}.
Reminder: {{REMINDER_TEXT}}
```

### 7C: Location-Aware Reminders

Named location registry + geofence checking on every location update from Telegram.

- [x] Create `mind/soul/config/locations.json` with initial locations (Randy to seed)
- [x] Create `mind/reminders.json` schema:
  ```json
  [
    {
      "id": "uuid",
      "text": "Pick up chicken and rice",
      "type": "location",
      "location": "publix",
      "radiusMeters": 500,
      "fired": false,
      "created": "2026-03-23T12:00:00Z"
    },
    {
      "id": "uuid",
      "text": "Call the dentist",
      "type": "time",
      "fireAt": "2026-03-24T09:00:00-04:00",
      "fired": false,
      "created": "2026-03-23T12:00:00Z"
    }
  ]
  ```
- [x] Add geofence check to location handler in daemon — on every location update, check all unfired location reminders
- [x] Haversine distance calculation in `src/lib/geo.ts`
- [x] When within radius → send reminder via Telegram + mark fired
- [x] Add time-based reminders — scheduler checks `reminders.json` on each tick
- [x] Edith creates reminders by writing to `reminders.json`
- [x] SOUL.md guidance: when Randy says "remind me", decide if it's location or time based
- [ ] Geocoding: Edith can look up addresses via web search and add to locations.json

### 7D: Typing Indicator

Show "typing..." in Telegram when Edith is working.

- [x] Call `sendChatAction("typing")` when a session starts
- [x] Re-send every 5s while session is active (Telegram typing indicator expires after 5s)
- [x] Stop when session ends or goes idle

### 7E: Message Format Cleanup

- [x] Update SOUL.md / protocols.md: no formal headers on messages ("To: Randy", "Sent: ...")
- [x] Just send the message content directly
- [x] Edith signs with "— Edith" only on longer/formal messages, not quick replies

### 7F: Message Persistence

Never lose a message. Save all incoming messages to a log before acknowledging the Telegram offset.

- [x] Create `logs/messages.jsonl` — append every incoming message (text, voice, SMS, location) with timestamp, type, raw content
- [x] Write to log BEFORE updating telegram-offset.txt
- [x] This is the permanent record — even if the daemon crashes mid-processing, messages are saved

---

## Phase 8: Tool Integration

### 8A: Code Delegation Skill

Edith delegates code tasks to the right CLI tool. This is a **skill**, not daemon code — Edith already has Bash access.

- [x] Create `.claude/skills/code-delegation/SKILL.md` with routing table + steps:
  - Gemini CLI (`gemini`) — large codebase understanding, 1M token context
  - Auggie CLI (`auggie`) — code review, test failures, CI
  - Claude Code (`claude -p`) — quick refactors, one-shot tasks
- [x] Verify `gemini` CLI is installed and authed — ✅ at /opt/homebrew/bin/gemini
- [x] Verify `auggie` CLI is installed and authed — ✅ v0.20.1

### 8B: Microsoft Teams Access

- [x] Research: is there an MCP server for Teams? — YES, several exist
  - [floriscornel/teams-mcp](https://github.com/floriscornel/teams-mcp) — Graph API access (best fit)
  - [InditexTech/mcp-teams-server](https://github.com/InditexTech/mcp-teams-server) — read/create/reply
  - Microsoft Teams SDK has native MCP support now
- [x] If feasible, create a skill for Teams access — created `.claude/skills/teams-access/SKILL.md`
- [ ] Install Teams MCP server — add `@floriscornel/teams-mcp` to mcp-config.json, do device code auth

---

## Phase 9: Autonomous Learning

### 9A: Preference Learning

Edith actively observes and records Randy's patterns without being told.

- [x] Add guidance to protocols.md: "Actively notice patterns in Randy's behavior, preferences, schedule, communication style. Record observations in RANDY.md under a '## Learned' section."
- [x] Examples: "Randy usually ignores marketing emails", "Randy responds faster to Telegram than email", "Randy's busiest meeting days are Tuesday/Thursday"
- [x] Edith updates RANDY.md periodically with new observations
- [x] Use Graphiti to store structured preference facts

### 9B: Self-Directed Learning

Edith researches topics on her own when she has idle time and it serves Randy's interests.

- [x] Add guidance to protocols.md: "When you have remaining turns and nothing urgent, research topics relevant to Randy's work or interests. Write findings to `knowledge/` files."
- [x] Edith uses WebSearch, WebFetch to research
- [x] Writes research notes to `mind/knowledge/` (picked up by summarizer)
- [x] Stores key facts in Graphiti for long-term recall

---

## Phase 10: SMS (Blocked — Needs Setup)

### Current Status
telegram-sms app is installed on Randy's phone. The architectural issue: telegram-sms sends messages AS the bot, so the bot can't see its own messages via `getUpdates`.

### Fix: Two-Bot Architecture
- [ ] Create a second Telegram bot via @BotFather (e.g. "EdithSMSRelay")
- [ ] Configure telegram-sms to use the RELAY bot token
- [ ] Create a Telegram group with both bots
- [ ] Configure Edith's bot with `can_read_all_group_messages` enabled (via @BotFather → /setprivacy → Disable)
- [ ] Update `TELEGRAM_CHAT_ID` to the group chat ID
- [x] Update daemon to handle group message format — accepts messages from SMS relay bot via `TELEGRAM_SMS_BOT_ID`
- [ ] Set `TELEGRAM_SMS_BOT_ID` env var to the relay bot's user ID
- [ ] Test: send SMS → appears in group → Edith's bot reads it

### telegram-sms Settings
- Bot token: use the RELAY bot token (not Edith's)
- Chat ID: the group chat ID
- Trusted number: 9416627510
- Enable: "Forward received SMS", "Battery monitoring"

---

## Completed (v1)

- ✅ Phase 0: Identity rewrite
- ✅ Phase 1: Battery telemetry, caffeinate
- ✅ Phase 2: MCP integration (apple-mcp, pre-wake context)
- ✅ Phase 3A: Session continuity (continue: true)
- ✅ Phase 3B: Real-time messaging (streamInput + outbox watcher)
- ✅ Phase 3C: Signal-based commands (pause/resume/fresh)
- ✅ Phase 3D: Error recovery (backoff, circuit breaker, Graphiti health)
- ✅ Phase 3E: Skills system (v1 custom — being replaced by SDK native skills in 7A)
- ✅ Phase 4A: Daemon-side summarizer
- ✅ Phase 4B: Obsidian read/write access
- ✅ Phase 4C: Memory hygiene (consolidation, decay)
- ✅ Phase 5A: Task queue
- ✅ Phase 5B: Location awareness (core tracking + expiry)
- ✅ Phase 5C: SMS tag detection
- ✅ Phase 6A: Voice notes (Groq Whisper STT)

## Priority Order (v2)

1. **Phase 7A** — Mind directory restructure (foundation for everything else)
2. **Phase 7F** — Message persistence (never lose messages again)
3. **Phase 7B** — Event-driven daemon (biggest architectural change)
4. **Phase 7D** — Typing indicator (quick win, visible improvement)
5. **Phase 7E** — Message format cleanup (quick win)
6. **Phase 8A** — Code delegation skill (quick win, just a skill file)
7. **Phase 7C** — Location-aware reminders
8. **Phase 9A** — Preference learning
9. **Phase 9B** — Self-directed learning
10. **Phase 8B** — Teams access (needs research)
11. **Phase 10** — SMS two-bot fix (needs Randy's phone)

## Architecture Principles (v2)

1. **Event-driven, not polling** — Edith wakes on scheduled briefs, messages, geofence triggers, or her own request. Not a constant loop.
2. **System prompt = soul** — Who Edith is + how to operate. Stable, rarely changes. Loaded from `mind/soul/`.
3. **Codebase aware** — Edith's cwd is project root. She can read daemon code and understand her own architecture. She writes to `mind/`, doesn't modify `src/` without approval.
4. **Briefs = context** — Scheduled prompts deliver only what's new and relevant. Not a full context dump every time.
5. **Edith reads on demand** — Journal, tasks, memory, knowledge are files she can read when she needs them. Don't force-feed everything.
6. **Persistent sessions** — `continue: true`. Sessions span across briefs. Fresh only when signaled.
7. **All messages go to Edith** — No keyword matching in the daemon. She's an LLM.
8. **SDK-native skills** — Skills live in `.claude/skills/` using the Agent SDK's native discovery + progressive loading. No custom skill index.
9. **Tool delegation via skills** — Code tasks routed to gemini/auggie/claude CLIs via a skill. No daemon code needed.
10. **Learn autonomously** — Edith observes patterns and records them. RANDY.md grows over time.
11. **Never lose data** — All messages logged before offset acknowledgment. All state is files on disk.
12. **Fail gracefully** — Session dies → restart. Graphiti down → skip it. Rate limited → back off.
