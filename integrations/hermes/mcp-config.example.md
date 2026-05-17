# Hermes MCP config example

Register local stdio MCP server (with runtime env vars):

```bash
hermes mcp add arca-siradig \
  --command python3 \
  --args /opt/data/vaults/personal/Projects/arca-siradig/mcp/server.py \
  --env ARCA_CUIT=... ARCA_PASSWORD=...

hermes mcp list
hermes mcp test arca-siradig
```

Then install/load the Hermes adapter skill:

```bash
hermes skills install https://raw.githubusercontent.com/<your-org-or-user>/arca-siradig/main/integrations/hermes/skills/arca-siradig.SKILL.md
```

In a fresh Hermes session:
- `/reload-mcp`
- `/reload-skills`
- `/skill arca-siradig`

Optional env var:
- `ARCA_SIRADIG_USER_FULLNAME` (used as default when `siradig_select_taxpayer` is called without `full_name`)
