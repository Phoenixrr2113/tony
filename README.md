# Edith

A proactive, always-on AI personal assistant with persistent memory and continuity.

Edith runs as a daemon on macOS, waking in continuous sessions to check your calendar, scan email, manage tasks, and handle anything that needs attention — without being asked. She communicates via Telegram (including voice notes from Meta Ray-Ban glasses) and remembers everything across sessions using a local knowledge graph.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  DAEMON (infrastructure — Edith cannot access)   │
│                                                   │
│  daemon.ts ──> Watchdog loop (wake/monitor/restart)
│  wake.ts   ──> Spawns Agent SDK sessions          │
│  context.ts ──> Assembles system prompt + context │
│  telegram.ts ──> Polls for messages from Randy    │
│  schedule.json ──> Configuration                  │
│                                                   │
│  Uses: @anthropic-ai/claude-agent-sdk             │
└─────────────┬───────────────────────────────────┘
              │ Agent SDK query()
              ▼
┌─────────────────────────────────────────────────┐
│  EDITH (the assistant)                           │
│                                                   │
│  System prompt: SOUL.md + IDENTITY.md + CREATOR.md│
│  Reads/writes: MEMORY.md, journal/*, tasks.json  │
│  Tools: Read, Write, Edit, Bash, Glob, Grep,    │
│         WebFetch, WebSearch, Task                │
│  MCP: apple-mcp (Calendar, Mail, Notes, etc.)    │
│       graphiti-memory (knowledge graph)           │
│  Cannot access: daemon code, schedule, logs/      │
└─────────────────────────────────────────────────┘
```

## How It Works

1. **Daemon starts** — Launches watchdog loop, Telegram poller, caffeinate (prevents sleep)
2. **Session begins** — Daemon assembles context (calendar, inbox, tasks, memory, knowledge summaries) and spawns an Agent SDK session
3. **Edith works** — Reads inbox, checks calendar, works pending tasks, acts proactively
4. **Session ends** — Edith journals what she did, updates memory, stores facts in knowledge graph
5. **Restart** — Watchdog restarts after idle timeout (5 min) or session completion. Telegram messages interrupt sleep for immediate wake

## File Structure

```
edith/
├── mind/                    # Edith's workspace (she reads/writes here)
│   ├── SOUL.md              # Core behavior and priorities
│   ├── IDENTITY.md          # Name, voice, continuity
│   ├── CREATOR.md           # Randy's info, contact rules
│   ├── MEMORY.md            # Synthesized working memory
│   ├── tasks.json           # Persistent task queue
│   ├── journal/             # Daily session logs
│   │   ├── YYYY-MM-DD.md
│   │   ├── creator-inbox.md  # Messages from Randy (via Telegram)
│   │   └── creator-outbox.md # Messages to Randy (sent via Telegram)
│   ├── skills/              # Reusable skills Edith creates
│   └── knowledge/           # Long-form knowledge files
│
├── src/                     # Daemon infrastructure (Edith cannot access)
│   ├── daemon.ts            # Watchdog loop
│   ├── wake.ts              # Session orchestration
│   └── lib/                 # Context assembly, state, Telegram, etc.
│
├── logs/                    # Daemon logs and transcripts
├── schedule.json            # Configuration (hours, limits, timeouts)
├── mcp-config.json          # MCP server configuration
└── PLAN.md                  # Development roadmap
```

## Requirements

- **Bun** — Runtime
- **Anthropic API key** — For Agent SDK
- **Telegram Bot** — For communication with Randy
- **Graphiti** — Knowledge graph at localhost:8000 (optional but recommended)

## Running

```bash
# Start the daemon (keeps Edith alive)
bun run src/daemon.ts

# Manual single wake (testing)
bun run src/wake.ts manual

# Check status
bun run src/status.ts
```

## Configuration

Edit `schedule.json`:

| Field | Default | Description |
|---|---|---|
| `watchdog.idleTimeoutSeconds` | `300` | Kill session after N seconds idle |
| `watchdog.restartDelaySeconds` | `5` | Delay between sessions |
| `watchdog.activeHours` | `06:00–23:00 ET` | When Edith runs |
| `agent.maxTurns` | `100` | Max tool-use turns per session |
| `agent.costLimits.perDay` | `$10` | Daily spend cap |
| `agent.costLimits.perMonth` | `$200` | Monthly spend cap |
