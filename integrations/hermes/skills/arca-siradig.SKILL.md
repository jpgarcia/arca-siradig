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

If MCP tools are unavailable:

1) Ask the user where the local repository path is.
2) Register MCP server with local python + server.py path.
3) Run `hermes mcp test arca-siradig`.
4) If healthcheck reports missing env vars, ask only for those vars.

Taxpayer full-name strategy:
- Prefer passing `full_name` directly when calling `siradig_select_taxpayer`.
- Optional fallback env var: `ARCA_SIRADIG_USER_FULLNAME`.

Notes:
- Use local stdio MCP registration. Do not assume npm/pypi distribution.


## MCP Tools Expected

- `siradig_healthcheck`
- `siradig_login`
- `siradig_list_taxpayers`
- `siradig_session_status`
- `siradig_select_taxpayer`
- `siradig_get_personal_data`
- `siradig_list_forms`
- `siradig_open_form_pdf`

## Standard flows

1. Current user data

- `siradig_healthcheck` -> `siradig_login` -> `siradig_list_taxpayers` -> `siradig_select_taxpayer` -> `siradig_get_personal_data`
- If multiple taxpayers exist, present the list and ask user to pick one.
- If `siradig_select_taxpayer` returns `taxpayer_not_found`, retry using one of the exact names from `siradig_list_taxpayers`.
- If page looks not logged (portal home), call `siradig_login` again and then `siradig_list_taxpayers`.

2. List submitted forms (visible period)

- `siradig_healthcheck` -> `siradig_login` -> `siradig_select_taxpayer` -> `siradig_list_forms`

3. List submitted forms for target year

- `siradig_healthcheck` -> `siradig_login` -> `siradig_select_taxpayer` -> `siradig_list_forms(year=YYYY)`
- then ask user whether to open a specific PDF via `siradig_open_form_pdf`

## Operating rules

- Prefer read-only operations by default.
- Keep outputs structured and explicit about visible period/year.
- Reuse existing session when possible by calling `siradig_login` first (it now reuses persisted state when valid).
- If session appears expired, restart from `siradig_login`.
- If selector matching fails for taxpayer, use exact `ARCA_SIRADIG_USER_FULLNAME` string.
