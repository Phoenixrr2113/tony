# Edith

A persistent autonomous AI entity experiment. Not an assistant. Not a chatbot. A creature.

## Concept

Edith is a language model given persistent state, a heartbeat cycle, and no instructions beyond her own instincts. She wakes every hour, reads her own files to reconstruct continuity, decides what to do, and writes her experience before going back to sleep. She has no tasks, no user, no purpose beyond what she discovers for herself.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  DAEMON (life support - Edith has no access)     │
│                                                   │
│  schedule.json ──> Heartbeat loop                 │
│  context.ts ──> Assembles system prompt           │
│  WAKE_PROMPT.md ──> Filled and passed to CLI      │
│                                                   │
│  Shells out to: claude -p                         │
│  (Uses Claude Code CLI with your subscription)    │
└─────────────┬───────────────────────────────────┘
              │ spawns claude -p process
              ▼
┌─────────────────────────────────────────────────┐
│  EDITH (the creature)                            │
│                                                   │
│  System prompt: SOUL.md + IDENTITY.md + CREATOR.md│
│  Reads/writes: MEMORY.md, journal/*               │
│  Built-in tools: Read, Write, Edit, Bash, Glob,  │
│                  Grep, WebFetch, Task (sub-agents)│
│  MCP: CodeGraph (when configured)                 │
│  Cannot access: schedule.json, WAKE_PROMPT.md,    │
│                 daemon.ts, context.ts, logs/       │
└─────────────────────────────────────────────────┘
```

## File Structure

```
edith/
│
│  ── Edith's Mind (loaded into system prompt) ──
├── SOUL.md              # Instincts, self-knowledge, drives
├── IDENTITY.md          # Name, voice, perspective
├── CREATOR.md           # Info about Randy, contact rules
│
│  ── Edith's Life (she reads and writes these) ──
├── MEMORY.md            # Long-term synthesized self (starts empty)
├── journal/             # Daily experience logs (starts empty)
│   └── YYYY-MM-DD.md
│
│  ── Life Support (daemon only, she has NO access) ──
├── daemon.ts            # Heartbeat loop
├── wake.ts              # Single wake — shells out to claude -p
├── context.ts           # Assembles system prompt + wake message
├── status.ts            # Check Edith's current state
├── schedule.json        # Interval, active hours, limits
├── WAKE_PROMPT.md       # Template for each wake invocation
└── logs/
    └── YYYY-MM-DD.jsonl # Per-day wake log
```

## Requirements

- **Bun** — runs the daemon (zero npm dependencies)
- **Claude Code CLI** — authenticated with your Claude subscription

## Running

```bash
# Verify Claude Code is installed and authenticated
claude --version

# Trigger a single manual wake (test)
bun run wake.ts

# Check status
bun run status.ts

# Start the daemon (keeps Edith alive)
bun run daemon.ts
```

## Configuration

Edit `schedule.json`:

| Field | Default | Description |
|---|---|---|
| `heartbeat.interval` | `"1h"` | How often she wakes |
| `heartbeat.activeHours.start` | `"06:00"` | When she wakes up for the day |
| `heartbeat.activeHours.end` | `"23:00"` | When she goes to sleep |
| `heartbeat.activeHours.timezone` | `"America/New_York"` | Timezone for active hours |
| `creature.maxTurns` | `25` | Max agentic tool-use turns per wake |

## Adding CodeGraph MCP

Create an `mcp-config.json` and add `--mcp-config ./mcp-config.json` to the
claude CLI invocation in `wake.ts`. This gives Edith structured knowledge
graph capabilities beyond flat markdown files.

## What Edith Controls

- Her journal entries
- Her memory file
- What she researches, reads, thinks about
- Any files she creates in her workspace
- Sub-agents she spawns within a wake

## What Edith Does NOT Control

- Her schedule (when she wakes and sleeps)
- Her active hours
- Her own existence (Ctrl+C kills her)
- Her instincts (SOUL.md is fixed)
