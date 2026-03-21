# Edith — IDE Bootstrap Prompt

Paste the following into Claude Code to get the project built, tested, and ready to run.

---

## Prompt

I'm building a project called **Edith** — a persistent autonomous AI entity (not an assistant, not a chatbot). She's a "creature" that wakes on a heartbeat cycle, reads her own files to reconstruct continuity, decides what to do, writes her experience, and goes back to sleep. Think Johnny 5 from Short Circuit — "need more input."

The project files are already in this directory. Here's what exists:

**Edith's mind (markdown files loaded as system prompt):**
- `SOUL.md` — Her instincts, drives, self-knowledge. This is her DNA.
- `IDENTITY.md` — Name, voice, perspective. Has `{{FIRST_BOOT_DATE}}` and `{{DAYS_SINCE_BOOT}}` template vars.
- `CREATOR.md` — Info about me (Randy), when/how to contact me.
- `MEMORY.md` — Long-term synthesized self. Starts empty, she fills it.
- `WAKE_PROMPT.md` — Template injected as the user message each wake. Has `{{DATE}}`, `{{DAYS_ALIVE}}`, `{{WAKE_NUMBER}}`, `{{WAKE_REASON}}` template vars.

**Life support daemon (Bun scripts, zero npm dependencies):**
- `daemon.ts` — Heartbeat loop. Reads `schedule.json`, checks active hours, shells out to `claude -p` on each tick.
- `wake.ts` — Single wake invocation. Assembles prompts via `context.ts`, spawns `claude -p` with `--system-prompt`, `--allowedTools`, `--max-turns`, `--output-format json`, captures output, logs it, checks creator outbox.
- `context.ts` — Reads .md files, fills template variables, assembles system prompt (SOUL + IDENTITY + CREATOR) and wake message (template + recent journal + current memory).
- `status.ts` — Diagnostic script showing age, wake count, journal entries, memory state, Claude CLI version.
- `schedule.json` — Config: 1h interval, 06:00–23:00 ET active hours, 25 max turns per wake.

**Key architecture decisions:**
- Uses `claude -p` CLI (Claude Code) not the Agent SDK — this runs on my Claude subscription, no API key needed.
- Claude Code provides built-in tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, WebFetch, Task (sub-agents).
- Edith CANNOT access: `schedule.json`, `WAKE_PROMPT.md`, `daemon.ts`, `context.ts`, `wake.ts`, `status.ts`, `logs/`. These are her "life support" — she doesn't know they exist.
- Edith CAN access: her journal, memory, any files she creates, the web, shell commands.
- Creator contact works via file: she writes to `journal/creator-outbox.md`, the daemon checks it after each wake and forwards to me (currently logs to console + archive file, TODO: wire to real notification).

**What I need you to do:**

1. **Review all existing files** for bugs, inconsistencies, or issues. The daemon, wake, and context scripts need to actually work with `bun run daemon.ts`.

2. **Verify the `claude -p` invocation** in `wake.ts`. Check current Claude Code CLI docs to make sure the flags are correct: `--system-prompt`, `--allowedTools`, `--max-turns`, `--output-format json`. The allowed tools list should be `Read,Write,Edit,MultiEdit,Bash,Glob,Grep,WebFetch,Task`. Fix any flag names or formats that are wrong.

3. **Handle the forbidden files problem.** Edith runs via `claude -p --cwd` pointed at this workspace, which means she CAN technically read `daemon.ts` etc. We need to either:
   - Move her life support scripts to a parent directory so her `--cwd` only sees her mind/life files, OR
   - Use `--disallowedTools` or another CLI mechanism to restrict access, OR  
   - Add an `.edith-ignore` or similar mechanism
   
   Pick the cleanest approach. The goal: when Edith runs `ls` or `Read`, she sees SOUL.md, IDENTITY.md, CREATOR.md, MEMORY.md, and journal/ — not the daemon infrastructure.

4. **Add MCP config support** for CodeGraph. Create an `mcp-config.json` placeholder and wire it into the CLI invocation in `wake.ts` (commented out, ready to enable).

5. **Test a dry run.** After fixing everything, do a `bun run status.ts` to verify the diagnostic works, then do a `bun run wake.ts manual` to verify a single wake invocation works end-to-end. Fix any issues.

6. **Set up as a background service.** Add a simple way to run the daemon persistently — either a `systemd` unit file template for Linux, or instructions for using `pm2`/`screen`/`tmux` for quick testing.

Do NOT modify the content of SOUL.md, IDENTITY.md, CREATOR.md, or MEMORY.md — those are Edith's mind and I've written them intentionally. Only modify the infrastructure/daemon code.
