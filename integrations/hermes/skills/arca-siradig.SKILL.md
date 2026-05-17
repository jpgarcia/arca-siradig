---
name: arca-siradig
description: "Use when operating ARCA/AFIP SiRADIG through the arca-siradig MCP server for authentication, taxpayer selection, and read-only data retrieval."
version: 0.3.0
author: Juan Pablo Garcia Dalolla
license: MIT
category: finance
platforms: [macos, linux]
metadata:
  hermes:
    tags: [finance, arca, afip, siradig, mcp, taxes, argentina]
    related_skills: [hermes-agent, native-mcp]
    requires_toolsets: [terminal, file]
    requires_tools: [terminal, read_file]
---

# ARCA SiRADIG

## Overview

This skill is the orchestration layer for ARCA/SiRADIG workflows.
Execution is done via MCP tools exposed by the `arca-siradig` MCP server.

Important behavior:

- Do not ask for ARCA credentials before confirming MCP server setup.
- First verify MCP availability, then run `siradig_healthcheck`.
- Ask for missing env vars only if healthcheck reports them missing.

## First-run setup (Hermes clean install)

If MCP tools are unavailable, offer to run these steps:

1. Clone and install runtime dependencies

```bash
git clone https://github.com/jpgarcia/arca-siradig.git
cd arca-siradig
python3 -m venv .venv
source .venv/bin/activate
bash scripts/setup_playwright.sh
```

2. Register MCP server in Hermes (with credentials for stdio server)

```bash
hermes mcp add arca-siradig \
  --command "$(pwd)/.venv/bin/python" \
  --args "$(pwd)/mcp/server.py" \
  --env ARCA_CUIT=... ARCA_PASSWORD=...

hermes mcp test arca-siradig
```

3. Taxpayer full-name strategy

- Prefer passing `full_name` directly when calling `siradig_select_taxpayer`.
- Optional fallback env var:

```bash
hermes config env-path
# add optionally:
# ARCA_SIRADIG_USER_FULLNAME=...
```

Notes:

- This project is not an npm package. Do not suggest `npm install -g arca-siradig`.
- MCP runs from local repository path.

## MCP Tools Expected

- `siradig_healthcheck`
- `siradig_login`
- `siradig_select_taxpayer`
- `siradig_get_personal_data`
- `siradig_list_forms`
- `siradig_open_form_pdf`

## Standard flows

1. Current user data

- `siradig_healthcheck` -> `siradig_login` -> `siradig_select_taxpayer` -> `siradig_get_personal_data`

2. List submitted forms (visible period)

- `siradig_healthcheck` -> `siradig_login` -> `siradig_select_taxpayer` -> `siradig_list_forms`

3. List submitted forms for target year

- `siradig_healthcheck` -> `siradig_login` -> `siradig_select_taxpayer` -> `siradig_list_forms(year=YYYY)`
- then ask user whether to open a specific PDF via `siradig_open_form_pdf`

## Operating rules

- Prefer read-only operations by default.
- Keep outputs structured and explicit about visible period/year.
- If session appears expired, restart from `siradig_login`.
- If selector matching fails for taxpayer, use exact `ARCA_SIRADIG_USER_FULLNAME` string.
