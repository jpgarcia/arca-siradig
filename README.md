# arca-siradig

Portable-first MCP toolkit for ARCA/AFIP SiRADIG automation.

## Design goal
Keep the MCP server framework-agnostic, then add thin integration layers per agent platform (Hermes, OpenClaw, others).

## Repository layout
- `mcp/` -> portable MCP server implementation (core)
- `docs/` -> contracts and platform docs
- `integrations/hermes/` -> Hermes-specific skill + setup
- `integrations/openclaw/` -> OpenClaw-specific setup/playbook
- `scripts/` -> setup helpers

## Current status (v0.3)
Implemented MCP tools:
- `siradig_healthcheck`
- `siradig_login` (Playwright)
- `siradig_select_taxpayer` (Playwright)
- `siradig_get_personal_data` (header extraction)

Planned next tools:
- `siradig_list_forms`
- `siradig_open_form_pdf`

## Required environment variables
- `ARCA_CUIT`
- `ARCA_PASSWORD`
- `ARCA_SIRADIG_USER_FULLNAME`

Optional:
- `ARCA_PLAYWRIGHT_HEADLESS` (`true` by default)

## Local setup (repo)
```bash
python3 -m venv .venv
source .venv/bin/activate
bash scripts/setup_playwright.sh
```

## Quickstart from a clean Hermes install
This is the minimum flow to make a fresh Hermes instance use this MCP server.

1) Clone repo and install dependencies
```bash
git clone https://github.com/<your-org-or-user>/arca-siradig.git
cd arca-siradig
python3 -m venv .venv
source .venv/bin/activate
bash scripts/setup_playwright.sh
```

2) Register MCP in Hermes
```bash
hermes mcp add arca-siradig --command "$(pwd)/.venv/bin/python $(pwd)/mcp/server.py"
hermes mcp test arca-siradig
```

3) Install Hermes skill adapter from this repo (optional but recommended)
```bash
hermes skills install https://raw.githubusercontent.com/<your-org-or-user>/arca-siradig/main/integrations/hermes/skills/arca-siradig.SKILL.md
```

4) Set ARCA credentials in Hermes env
```bash
hermes config env-path
# edit the shown file and add:
# ARCA_CUIT=...
# ARCA_PASSWORD=...
# ARCA_SIRADIG_USER_FULLNAME=...
```

5) First real test in Hermes chat
Ask Hermes to call, in order:
- `siradig_healthcheck`
- `siradig_login`
- `siradig_select_taxpayer`
- `siradig_get_personal_data`

Expected result:
- login reaches `menu_sel_empresa.jsp`
- taxpayer selection opens URL containing `determinarContribuyente.do`
- personal data returns: `usuario`, `representando_a`, `dependencia`

## Hermes UX notes
- This repo is not an npm package. Do not run `npm install -g arca-siradig`.
- Skill installation cannot auto-install MCP by itself today.
- Best UX is: MCP registered first, then skill installed.

## Security notes
- Never hardcode ARCA credentials in repo files.
- Keep secrets in Hermes `.env` only.

## Troubleshooting
- `Playwright is not available`: run `bash scripts/setup_playwright.sh`.
- Browser dependency errors: run `python3 -m playwright install chromium`.
- `session_not_ready`: call `siradig_login` before any other browser tool.
