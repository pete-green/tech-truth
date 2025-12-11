# MCP Setup Troubleshooting Guide

## Current Configuration

**Project**: Tech Truth
**MCP Server**: Supabase
**Config File**: `.mcp.json` in project root

### .mcp.json contents:
```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=qakegqgwusxvdnghfzqo"
    }
  }
}
```

## The Problem

`/mcp` command shows "No MCP servers configured" even though `.mcp.json` exists and is correctly formatted.

## Root Cause

The Supabase MCP server requires **OAuth authentication**. The server IS configured (you can verify with `claude mcp get supabase`), but it won't appear in `/mcp` until authenticated.

## Diagnostic Commands

```bash
# Check if server is actually configured (THIS WORKS even when /mcp shows nothing)
claude mcp get supabase

# Expected output:
# supabase:
#   Scope: Project config (shared via .mcp.json)
#   Status: ⚠ Needs authentication
#   Type: http
#   URL: https://mcp.supabase.com/mcp?project_ref=qakegqgwusxvdnghfzqo

# List all configured servers
claude mcp list

# Check Claude Code version
claude --version
```

## Solution Steps

1. **Reset project choices** to re-trigger approval prompts:
   ```bash
   claude mcp reset-project-choices
   ```

2. **Restart Claude Code** - exit completely and reopen

3. **When prompted**, approve the Supabase MCP server

4. **Complete OAuth** - a browser window should open to authenticate with Supabase

5. **Verify** by running `/mcp` - it should now show the Supabase server

## If OAuth Never Triggers

If the browser auth window never opens:

1. Check if you previously rejected the server - run `claude mcp reset-project-choices`
2. Make sure you're in the correct directory (where `.mcp.json` lives)
3. Try removing and re-adding:
   ```bash
   claude mcp remove supabase -s project
   claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=qakegqgwusxvdnghfzqo"
   ```

## Key Insight

**`/mcp` showing "No MCP servers" does NOT mean the config is broken.** It means no servers are currently *connected*. Use `claude mcp get supabase` to see the actual status.

## Claude Code Version at Time of Writing

2.0.64
