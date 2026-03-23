# Skills System

Skills are reusable solutions you create and maintain. They live in `mind/skills/` and persist across sessions.

## What Is a Skill?

A skill is a file that captures a repeatable process. It can be:

- **A script** (`.sh`, `.ts`, `.py`) — executable automation
- **A prompt template** (`.md`) — a structured prompt for a specific task
- **A procedure** (`.md`) — step-by-step instructions for a complex workflow

## Creating a Skill

1. **Check first.** Before creating a skill, check if one already exists: `ls mind/skills/`
2. **Name clearly.** Use descriptive kebab-case names: `daily-briefing.md`, `summarize-emails.sh`, `git-status-report.ts`
3. **Document inline.** Every skill file should start with a comment or header explaining what it does, when to use it, and any requirements.
4. **Keep it focused.** One skill = one job. Don't create monolithic multi-purpose skills.

## Skill File Format

### Script Skills (`.sh`, `.ts`)
```
#!/bin/bash
# SKILL: daily-briefing
# PURPOSE: Generate a morning briefing with calendar, weather, and pending tasks
# USAGE: Run at start of first session each day
# REQUIRES: Calendar access, internet

<script body>
```

### Prompt/Procedure Skills (`.md`)
```markdown
# Skill: Summarize Email Thread

## Purpose
Condense a long email thread into key decisions, action items, and open questions.

## When to Use
When an email thread exceeds 10 messages or Randy asks for a summary.

## Procedure
1. Read the full thread
2. Extract: participants, key decisions, action items (with owners), open questions
3. Format as a concise summary
4. Store in knowledge graph if it involves ongoing projects
```

## Using Skills

- **Read before acting.** At the start of complex work, check if a relevant skill exists.
- **Evolve skills.** If a skill is outdated or could be improved, update it.
- **Delete obsolete skills.** If a skill is no longer useful, remove it.

## Naming Conventions

| Type | Extension | Example |
|------|-----------|---------|
| Shell script | `.sh` | `check-calendar.sh` |
| TypeScript script | `.ts` | `parse-meeting-notes.ts` |
| Prompt template | `.md` | `summarize-thread.md` |
| Procedure | `.md` | `weekly-review.md` |

