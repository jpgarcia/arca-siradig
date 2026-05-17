# E2E from a clean Hermes installation

## Goal

Validate that a fresh Hermes instance can install/use the ARCA SiRADIG MCP + skill end-to-end.

## Checklist

1. Fresh Hermes install works (`hermes doctor`).
2. Repo cloned locally.
3. MCP registered with required env vars:
   - ARCA_CUIT
   - ARCA_PASSWORD
4. MCP visible and testable.
5. Skill installed and loadable.
6. `siradig_healthcheck` returns `ready=true`.
7. Real flow works:
   - `siradig_login`
   - `siradig_list_taxpayers`
   - `siradig_select_taxpayer` (pick exact name from listed taxpayers)
   - `siradig_get_personal_data`

## Commands

```bash
# 1) Clone
cd /tmp
git clone <YOUR_GITHUB_URL> arca-siradig
cd arca-siradig

# 2) Install runtime
python3 -m venv .venv
source .venv/bin/activate
bash scripts/setup_playwright.sh

# 3) Register MCP with env vars
read -r -p "ARCA_CUIT: " ARCA_CUIT
read -r -s -p "ARCA_PASSWORD: " ARCA_PASSWORD; echo

hermes mcp add arca-siradig \
  --command /tmp/arca-siradig/.venv/bin/python \
  --args /tmp/arca-siradig/mcp/server.py \
  --env ARCA_CUIT="$ARCA_CUIT" ARCA_PASSWORD="$ARCA_PASSWORD"

hermes mcp test arca-siradig

# 4) Install skill
hermes skills install https://raw.githubusercontent.com/jpgarcia/arca-siradig/main/integrations/hermes/skills/arca-siradig.SKILL.md

# 5) Start Hermes and load
hermes
# /reload-mcp
# /reload-skills
# /skill arca-siradig
```

## Expected current result (v0.4)

- `siradig_healthcheck`: implemented and validates env vars.
- `siradig_login`: implemented with Playwright (includes portal-to-SiRADIG handoff).
- `siradig_list_taxpayers`: implemented and returns selectable names.
- `siradig_select_taxpayer`: implemented with `full_name` input (optional env fallback).
- `siradig_get_personal_data`: implemented (`usuario`, `representando_a`, `dependencia`).
- `siradig_list_forms`: not implemented.
- `siradig_open_form_pdf`: not implemented.

## Publish prep

Before public release:

- Add LICENSE
- Add CONTRIBUTING.md
- Add release tags/changelog
- Implement remaining SiRADIG tools and mark v1.0

## Secret handling rule

- Never print credential env vars in terminal output/logs (`print(os.getenv(...))`, `echo $ARCA_PASSWORD`, etc.).
