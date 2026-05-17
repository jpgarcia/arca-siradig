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

## Current status (v0.4)

Implemented MCP tools:

- `siradig_healthcheck`
- `siradig_login` (Playwright + portal-to-SiRADIG handoff)
- `siradig_session_status`
- `siradig_list_taxpayers`
- `siradig_select_taxpayer` (Playwright)
- `siradig_get_personal_data` (header extraction)

Planned next tools:

- `siradig_list_forms`
- `siradig_open_form_pdf`

## Required environment variables

- `ARCA_CUIT`
- `ARCA_PASSWORD`

Optional:

- `ARCA_SIRADIG_USER_FULLNAME` (only used as default for taxpayer selection)
- `ARCA_PLAYWRIGHT_HEADLESS` (`true` by default)

## Local setup (repo)

```bash
python3 -m venv .venv
source .venv/bin/activate
bash scripts/setup_playwright.sh
```

## Quickstart from a clean Hermes install

This is the minimum flow to make a fresh Hermes instance use this MCP server.

1. Clone repo and install dependencies

```bash
git clone https://github.com/jpgarcia/arca-siradig.git
cd arca-siradig
python3 -m venv .venv
source .venv/bin/activate
bash scripts/setup_playwright.sh
```

2. Register MCP in Hermes (including env vars for stdio server)

```bash
hermes mcp add arca-siradig \
  --command "$(pwd)/.venv/bin/python" \
  --args "$(pwd)/mcp/server.py" \
  --env ARCA_CUIT=... ARCA_PASSWORD=...

hermes mcp test arca-siradig
```

3. Install Hermes skill adapter from this repo (optional but recommended)

```bash
hermes skills install https://raw.githubusercontent.com/jpgarcia/arca-siradig/main/integrations/hermes/skills/arca-siradig.SKILL.md
```

4. Taxpayer full name handling

- You can pass it explicitly in `siradig_select_taxpayer(full_name=...)`.
- Or define optional fallback env var in Hermes config/env:

```bash
hermes config env-path
# add optionally:
# ARCA_SIRADIG_USER_FULLNAME=...
```

5. First real test in Hermes chat
   Ask Hermes to call, in order:

- `siradig_healthcheck`
- `siradig_login`
- `siradig_list_taxpayers` (show options and pick exact name)
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
- Session persistence: MCP stores Playwright `storage_state` at `mcp/.session/storage_state.json` and reuses it when valid; if ARCA expires the session, re-run `siradig_login`.
