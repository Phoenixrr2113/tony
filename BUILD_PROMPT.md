# Edith — Build Prompt

Paste this into a new Claude Code session to continue building Edith.

---

## Prompt

You are building **Edith** — a proactive, always-on AI personal assistant daemon for macOS. Your job is to implement the roadmap in `PLAN.md`, working through each phase in priority order.

### How to Work

1. **Read `PLAN.md`** first. The Priority Order at the bottom tells you what to build next. Skip any phase marked ✅.

2. **Before coding each task**, read the relevant source files to understand the current implementation:
   - Daemon infrastructure: `src/daemon.ts`, `src/wake.ts`, `src/lib/*.ts`
   - Edith's mind: `mind/SOUL.md`, `mind/IDENTITY.md`, `mind/CREATOR.md`
   - Config: `schedule.json`, `mcp-config.json`
   - Architecture: `README.md`, `BOOTSTRAP_PROMPT.md`

3. **Research before you build.** If a task involves the Agent SDK (`@anthropic-ai/claude-agent-sdk`), Telegram Bot API, Graphiti, or any external API — look up the current docs. Don't guess at function signatures or options. Check `node_modules/@anthropic-ai/claude-agent-sdk` for types and available methods (especially `continue`, `streamInput`, session management).

4. **Build incrementally.** Implement each checkbox item in the plan, test that it compiles (`bun build src/daemon.ts`), and move to the next. Don't try to implement an entire phase at once.

5. **Update `PLAN.md`** as you go — check off completed items with `[x]`. If you discover something that needs to change, update the plan.

6. **Commit after each phase number** (3A, 3B, 3C, etc.) with a clear message describing what was implemented. Use conventional commits:
   ```
   feat(3A): add persistent sessions with continue: true
   feat(3B): add real-time message injection via streamInput
   feat(3C): add signal files for session control commands
   ```

7. **Don't stop between phases.** After committing one phase, immediately start the next one in the priority order. Keep building until all phases are complete or you hit a blocker that requires Randy's input.

### Key Architecture Context

- **Runtime**: Bun (not Node.js). Use `bun build` and `bun run`.
- **Agent SDK**: `@anthropic-ai/claude-agent-sdk` — the `query()` function. NOT the Claude CLI (`claude -p`).
- **Subscription model**: Claude Max ($200/month flat). No per-token cost tracking needed. Rate limits are the constraint, not dollars.
- **Session model**: Persistent sessions with `continue: true`. Each wake resumes the previous session. Fresh sessions only when signaled.
- **Telegram**: Outbound polling only. No webhooks, no exposed ports. Daemon polls every 5s.
- **MCP servers**: `apple-mcp` (Calendar, Mail, Notes, etc.) + `graphiti-memory` (knowledge graph at localhost:8000)
- **Edith's workspace**: `mind/` directory. Agent runs with `cwd: mind/`. Edith cannot see daemon code.
- **Permissions**: `permissionMode: "bypassPermissions"` — Edith acts autonomously.
- **Android phone**: SMS forwarded to Telegram via `telegram-sms` app. Location shared via Telegram live location.
- **Glasses**: Meta Ray-Ban. Voice commands via "Hey Meta, send a message on Telegram". No slash commands — everything is natural language.

### What NOT to Do

- Don't refactor working code unless the plan calls for it
- Don't add dependencies without checking if Bun supports them
- Don't change the daemon ↔ Edith boundary (daemon does infrastructure, Edith thinks and acts)
- Don't add cost tracking or budget enforcement (subscription model)
- Don't expose any inbound network ports
- Don't skip reading source files before modifying them

### If You Get Stuck

- If the Agent SDK doesn't support a method (e.g., `streamInput()`), check the actual SDK types in `node_modules/` and find the right approach. Document what you found in the plan.
- If Graphiti is down, skip graphiti-related tasks and note it in the plan.
- If a task is blocked on Randy (e.g., Android setup for SMS), mark it as blocked in the plan and move to the next task.
- If you're unsure about an architectural decision, check the Architecture Principles section at the bottom of `PLAN.md`.

Now read `PLAN.md` and start building from the first unchecked priority item.
