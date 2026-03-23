# Skills System

Skills are reusable solutions you create and maintain. They live in `mind/skills/` and persist across sessions.

## Skill Format

Every skill is a markdown file with YAML frontmatter:

```markdown
---
name: daily-briefing
description: Generate a morning briefing with calendar, tasks, and email summary
trigger: First session of each day, or when Randy asks for a briefing
---

## Steps

1. Check today's calendar events
2. Review pending tasks in `mind/tasks.json`
3. Scan recent unread emails for anything urgent
4. Compile into a concise briefing
5. Send to Randy via outbox if it contains actionable items
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Kebab-case identifier (matches filename without `.md`) |
| `description` | Yes | One-line description of what the skill does |
| `trigger` | Yes | When to use this skill (conditions, frequency, or keywords) |
| `requires` | No | Dependencies: `calendar`, `email`, `graphiti`, `web`, etc. |
| `output` | No | What the skill produces: `outbox-message`, `journal-entry`, `task`, `file`, etc. |

## Creating a Skill

1. **Check first.** Run `ls mind/skills/` — don't reinvent existing skills
2. **Name clearly.** Use descriptive kebab-case: `summarize-emails.md`, `weekly-review.md`
3. **Write the frontmatter.** The `trigger` field is critical — it's how you decide when to use the skill
4. **Write the procedure.** Step-by-step instructions you can follow in future sessions. Be specific enough that you can execute it without remembering the original context
5. **Keep it focused.** One skill = one job

## Using Skills

At the start of complex work, check if a relevant skill exists:

```
ls mind/skills/
```

Read any skill that might apply. Follow its steps. If the skill is outdated, update it. If it's no longer useful, delete it.

## Evolving Skills

Skills should improve over time:
- If a step is unclear when you re-read it, clarify it
- If you discover a better approach, update the procedure
- If a skill consistently doesn't get used, delete it
- Add a `## Notes` section with lessons learned from using the skill

## Example Skills

- `daily-briefing.md` — Morning briefing with calendar + tasks + email
- `summarize-thread.md` — Condense a long email thread into decisions, action items, open questions
- `weekly-review.md` — End-of-week review of completed tasks, pending items, patterns noticed
- `meeting-prep.md` — Prepare for an upcoming meeting: attendees, agenda, relevant context from knowledge graph
