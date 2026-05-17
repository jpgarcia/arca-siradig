# Hermes MCP config example

Register local stdio MCP server (with runtime env vars):

If you still don't have the repo locally:

```bash
git clone https://github.com/jpgarcia/arca-siradig.git
cd arca-siradig
```

```bash
read -r -p "ARCA_CUIT: " ARCA_CUIT
read -r -s -p "ARCA_PASSWORD: " ARCA_PASSWORD; echo

hermes mcp add arca-siradig \
  --command python3 \
  --args <repo-path>/mcp/server.py \
  --env ARCA_CUIT="$ARCA_CUIT" ARCA_PASSWORD="$ARCA_PASSWORD"

hermes mcp list
hermes mcp test arca-siradig
```

Then install/load the Hermes adapter skill:

```bash
hermes skills install https://raw.githubusercontent.com/jpgarcia/arca-siradig/main/integrations/hermes/skills/arca-siradig.SKILL.md
```

In a fresh Hermes session:

- `/reload-mcp`
- `/reload-skills`
- `/skill arca-siradig`

Optional env var:

- `ARCA_SIRADIG_USER_FULLNAME` (used as default when `siradig_select_taxpayer` is called without `full_name`)
