---
name: teams-access
description: Read and send Microsoft Teams messages via MCP server
trigger: When Randy asks about Teams messages, wants to check Teams, or needs to send a Teams message
---

## Setup Required

Install the Teams MCP server (uses Microsoft Graph API):

```bash
npm install -g @anthropic/mcp-server-teams  # or use floriscornel/teams-mcp from GitHub
```

Then add to `mcp-config.json`:

```json
{
  "mcpServers": {
    "teams": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-teams"],
      "env": {
        "MICROSOFT_TENANT_ID": "...",
        "MICROSOFT_CLIENT_ID": "...",
        "MICROSOFT_CLIENT_SECRET": "..."
      }
    }
  }
}
```

## Steps

1. **Check if Teams MCP is configured** — look for "teams" in mcp-config.json
2. **If not configured** — tell Randy setup is needed (Azure AD app registration required)
3. **Read messages** — use the Teams MCP tools to search/read messages
4. **Send messages** — use the Teams MCP tools to send or reply

## Candidate MCP Servers

- [floriscornel/teams-mcp](https://github.com/floriscornel/teams-mcp) — Graph API access for messaging, search, user management
- [InditexTech/mcp-teams-server](https://github.com/InditexTech/mcp-teams-server) — read, create, reply, mention
- Microsoft's official Teams SDK also supports MCP natively now

## Notes

- Created: 2026-03-23
- Origin: Phase 8B — Teams access research
- Status: Skill created, MCP server NOT yet installed. Randy needs to set up Azure AD app registration.
