# Hermes integration

This adapter contains the Hermes skill layer for the portable ARCA SiRADIG MCP.

## Files
- `skills/arca-siradig.SKILL.md`

## Install skill locally

```bash
mkdir -p ~/.hermes/skills/arca-siradig
cp integrations/hermes/skills/arca-siradig.SKILL.md ~/.hermes/skills/arca-siradig/SKILL.md
```

Then in Hermes:
- start a new session (or `/reload-skills`)
- load `/skill arca-siradig`

## Register MCP server (example)

Use Hermes MCP registration to point at:
- `python3 /opt/data/vaults/personal/Projects/arca-siradig/mcp/server.py`
