---
name: create-skill
description: Create a new reusable skill file with proper frontmatter and procedure
trigger: When you solve something worth repeating, or Randy says "make that a skill"
requires: filesystem
output: file
---

## Steps

1. **Check for duplicates.** Run `ls mind/skills/` and scan names + triggers. Don't create a skill that overlaps with an existing one. If similar, update the existing skill instead.

2. **Choose a clear name.** Use descriptive kebab-case: `summarize-emails`, `meeting-prep`, `weekly-review`. The name should make the skill's purpose obvious.

3. **Write the file** at `mind/skills/{name}.md` with this template:

```markdown
---
name: {kebab-case-name}
description: {One clear sentence describing what this skill does}
trigger: {When to use it — conditions, frequency, or keywords}
requires: {Optional: calendar, email, graphiti, web, filesystem}
output: {Optional: outbox-message, journal-entry, task, file}
---

## Steps

1. {First concrete action}
2. {Second concrete action}
3. ...

## Notes

- Created: {today's date}
- Origin: {what prompted creating this skill}
```

4. **Validate the skill:**
   - Every step should be specific enough to follow without extra context
   - The trigger should be unambiguous — when you read it next session, you should know immediately if it applies
   - Keep it focused: one skill = one job
   - If a step references another skill, use: `→ Run skill: {skill-name}`

5. **Log it.** Write a brief note in today's journal: "Created skill: {name} — {description}"

## Guidelines

- **When to create:** If you've done something useful 2+ times, or Randy explicitly asks
- **When NOT to create:** One-off tasks, trivial operations, things that change frequently
- **Skill chaining:** Skills can reference other skills in their steps: `→ Run skill: daily-briefing`
- **Improving skills:** When you use a skill and find a better approach, update it. Add a changelog note at the bottom.

## Notes

- Created: 2026-03-22
- Origin: Phase 3E skills system implementation
