# Edith — IDE Bootstrap Prompt

Paste the following into Claude Code to get oriented on the project.

---

## Prompt

I'm building **Edith** — a proactive, always-on AI personal assistant that runs as a daemon on macOS. She wakes in continuous sessions, checks my calendar, scans email, manages tasks, and handles anything that needs attention — without being asked. She communicates with me via Telegram (including voice notes from Meta Ray-Ban glasses) and remembers everything across sessions using a local knowledge graph (Graphiti).

The project files are already in this directory. Here's the architecture:

**Edith's mind (loaded into system prompt on each wake):**
- `mind/SOUL.md` — Core behavior, priorities, boundaries
- `mind/IDENTITY.md` — Name, voice, tone. Has `{{FIRST_BOOT_DATE}}` and `{{DAYS_SINCE_BOOT}}` template vars
- `mind/CREATOR.md` — Info about Randy (creator), contact rules, machine setup
- `mind/MEMORY.md` — Synthesized working memory (Edith reads/writes this)
- `mind/journal/` — Daily session logs, creator inbox/outbox
- `mind/skills/` — Reusable skills Edith creates
- `mind/knowledge/` — Long-form knowledge files

**Daemon infrastructure (Edith cannot access):**
- `src/daemon.ts` — Watchdog loop: monitors sessions, polls Telegram, manages restarts
- `src/wake.ts` — Single session: acquires lock, assembles context, runs Agent SDK `query()`, logs transcript
- `src/lib/context.ts` — Assembles system prompt + wake message with calendar, inbox, memory, knowledge summaries
- `src/lib/telegram.ts` — Polls Telegram Bot API for messages from Randy
- `src/lib/messaging.ts` — Inbox/outbox file management
- `src/lib/state.ts` — System state report (battery, memory usage, wake count)
- `src/lib/schedule.ts` — Schedule config parsing, boot date tracking
- `src/lib/prewake.ts` — Pre-wake context (calendar events via AppleScript)
- `src/lib/maintenance.ts` — Journal archival
- `src/lib/indexer.ts` — Knowledge file summarization (L0/L1/L2)
- `src/status.ts` — Diagnostic script

**Key architecture decisions:**
- Uses `@anthropic-ai/claude-agent-sdk` (`query()`) — not the Claude CLI
- Agent runs with `cwd: mind/` so Edith only sees her own workspace
- `permissionMode: "bypassPermissions"` — Edith acts autonomously
- MCP servers: `apple-mcp` (Calendar, Mail, Notes, etc.) + `graphiti-memory` (knowledge graph)
- Telegram polling (outbound only, no webhooks, no exposed ports)
- Watchdog: 300s idle timeout, 5s restart delay, 06:00–23:00 ET active hours
- Caffeinate prevents macOS sleep while daemon runs

**Config files:**
- `schedule.json` — Watchdog settings, agent config, cost limits
- `mcp-config.json` — MCP server definitions
- `.env` — API keys and Telegram tokens
- `com.edith.daemon.plist` — macOS LaunchAgent (optional)

See `PLAN.md` for the development roadmap.
