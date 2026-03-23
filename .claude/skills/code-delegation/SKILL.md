---
name: code-delegation
description: Delegate code tasks to the appropriate CLI tool (Gemini, Auggie, or Claude Code)
trigger: When Randy asks you to work on code, review a PR, fix a test, or understand a codebase
---

## Routing Table

| Task | Tool | Command | Why |
|------|------|---------|-----|
| Large codebase understanding | Gemini CLI | `gemini` | 1M token context, great at exploration |
| Code review, test failures, CI | Auggie CLI | `auggie` | Purpose-built for review workflows |
| Quick refactors, one-shot tasks | Claude Code | `claude -p "..."` | Fast, focused edits |
| Multi-file refactors | Claude Code | `claude -p "..."` | Good at coordinated changes |

## Steps

1. **Identify the task type.** Is it understanding, reviewing, or editing code?

2. **Choose the right tool** using the routing table above.

3. **Run the tool via Bash.** Examples:
   - `gemini "explain the authentication flow in src/"` — codebase exploration
   - `auggie review PR #42` — code review
   - `claude -p "refactor the logger to use structured logging"` — quick refactor

4. **Report results to Randy** via outbox if he asked for it.

## Notes

- Created: 2026-03-23
- Origin: Phase 8A — code delegation as a skill, not daemon code
- `gemini` ✅ installed at /opt/homebrew/bin/gemini
- `claude` ✅ installed at /Users/randywilson/.local/bin/claude
- `auggie` ❌ not installed — skip auggie tasks until installed
