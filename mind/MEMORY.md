# Memory

Working memory — synthesized understanding of Randy's world. Updated each session.

## About Randy

- Software engineer and builder in Bradenton, Florida
- Building Edith as a proactive personal assistant
- Phone: 941-662-7510
- Wife: Diana
- Prefers concise, direct communication — no fluff
- Telegram is primary contact channel
- Obsidian vault at `/Users/randywilson/Documents/Obsidian Vault`
- Has two Google calendars: driftking718@yahoo.com and randyrowanwilson@gmail.com

## Architecture

- Edith v2 running — event-driven daemon, mind directory restructured
- `mind/soul/` — system prompt files loaded at wake
- `.claude/skills/` — SDK-native skills (code-delegation, teams-access, create-skill)
- Two-bot SMS: Edith bot + @edith_sms_relay_bot (ID: 8657261490), group "Edith SMS" (-5166329087)
- Teams MCP: @floriscornel/teams-mcp in mcp-config.json — not yet authenticated

## Known Locations

- Home: 27.5030, -82.4725
- Diana's Workplace: 27.4373, -82.3627

## Current Status

- v2 fully built and running
- Calendar fetch fixed — briefs now surface real events
- Email context added to pre-wake briefs (last 15 unread)
- Proactive calendar alerting live — wakes 60min before events

## Open Items

- **SMS relay** — Telegram SMS Nightly not forwarding despite permissions. Try stable release from GitHub releases page.
- **Teams MCP** — @floriscornel/teams-mcp in mcp-config.json. Needs device code auth with Randy to activate.
- **Locations** — Home and Diana's Workplace seeded. More locations can be added via WebSearch + locations.json.
