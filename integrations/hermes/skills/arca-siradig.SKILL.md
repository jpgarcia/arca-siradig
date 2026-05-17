---
name: arca-siradig
description: "Use when operating ARCA/AFIP SiRADIG through the arca-siradig MCP tools for authentication, taxpayer selection, and read-only data retrieval."
version: 0.2.0
author: Juan Pablo Garcia Dalolla
license: MIT
platforms: [macos, linux]
required_environment_variables:
  - name: ARCA_CUIT
    prompt: "ARCA CUIT"
    help: "Taxpayer CUIT used for ARCA login (11 digits)."
    required_for: "Authentication in ARCA"
  - name: ARCA_PASSWORD
    prompt: "ARCA password"
    help: "Clave Fiscal / ARCA password for the CUIT account."
    required_for: "Authentication in ARCA"
  - name: ARCA_SIRADIG_USER_FULLNAME
    prompt: "SiRADIG full name"
    help: "Exact full name displayed in SiRADIG taxpayer selector."
    required_for: "Taxpayer context selection"
metadata:
  hermes:
    tags: [arca, afip, siradig, mcp, taxes, argentina]
    related_skills: [hermes-agent, native-mcp]
    requires_toolsets: [mcp, file, terminal]
    requires_tools: [read_file, terminal]
---

# ARCA SiRADIG

## Overview

This skill is the orchestration layer for ARCA/SiRADIG workflows.
Execution should be done via MCP tools provided by the `arca-siradig` MCP server.

## When to Use

Use this skill when the user asks to:
- check current SiRADIG user personal data,
- list submitted forms for the visible period,
- list submitted forms for a specific year,
- open a submitted form PDF.

## MCP Tools Expected

- `siradig_healthcheck`
- `siradig_login`
- `siradig_select_taxpayer`
- `siradig_get_personal_data`
- `siradig_list_forms`
- `siradig_open_form_pdf`

## Standard Flows

1) Current user data
- login -> select_taxpayer -> get_personal_data

2) List submitted forms (visible period)
- login -> select_taxpayer -> list_forms(year omitted)

3) List submitted forms for target year
- login -> select_taxpayer -> list_forms(year=YYYY)
- then ask user if they want to open a specific PDF

## Notes

- Prefer read-only operations by default.
- Keep outputs structured and explicit about visible period/year.
- If internal URLs return session-expired state, re-run through the full SSO path.
