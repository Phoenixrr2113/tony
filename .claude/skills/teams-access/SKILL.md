---
name: teams-access
description: Read and send Microsoft Teams messages via MCP server
trigger: When Randy asks about Teams messages, wants to check Teams, or needs to send a Teams message
---

## Setup

Uses [floriscornel/teams-mcp](https://github.com/floriscornel/teams-mcp) — community MCP server wrapping Microsoft Graph API. Device code auth (no Azure AD app registration needed).

Add to `mcp-config.json`:

```json
{
  "mcpServers": {
    "teams-mcp": {
      "command": "npx",
      "args": ["-y", "@floriscornel/teams-mcp@latest"]
    }
  }
}
```

On first run, it will prompt for device code auth — Randy logs in via browser once, tokens auto-refresh after that.

For read-only mode (safer): `"args": ["-y", "@floriscornel/teams-mcp@latest", "--read-only"]`

## Steps

1. **Check if Teams MCP is configured** — look for "teams-mcp" in mcp-config.json
2. **If not configured** — tell Randy to add the config above and restart the daemon
3. **Read messages** — use Teams MCP tools to search/read messages
4. **Send messages** — use Teams MCP tools to send or reply (unless read-only mode)

## Alternative

If floriscornel doesn't work, try [InditexTech/mcp-teams-server](https://github.com/InditexTech/mcp-teams-server) (Python, Docker-based, requires Azure AD app registration).

## Notes

- Created: 2026-03-23
- Origin: Phase 8B — Teams access
- Status: Skill created, MCP server NOT yet added to mcp-config.json
