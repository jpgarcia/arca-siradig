# Hermes MCP config example

Register local stdio MCP server:

```bash
hermes mcp add arca-siradig --command python3 --args /opt/data/vaults/personal/Projects/arca-siradig/mcp/server.py
hermes mcp list
hermes mcp test arca-siradig
```

Then load the Hermes adapter skill:

```bash
mkdir -p ~/.hermes/skills/arca-siradig
cp /opt/data/vaults/personal/Projects/arca-siradig/integrations/hermes/skills/arca-siradig.SKILL.md ~/.hermes/skills/arca-siradig/SKILL.md
```

In a fresh Hermes session:
- `/reload-mcp`
- `/reload-skills`
- `/skill arca-siradig`

Required env vars in `~/.hermes/.env`:
- `ARCA_CUIT`
- `ARCA_PASSWORD`
- `ARCA_SIRADIG_USER_FULLNAME`
