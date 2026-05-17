# arca-siradig

Portable-first repository for ARCA/AFIP SiRADIG automation.

## Design goal
Keep the MCP server framework-agnostic, then add thin integration layers per agent platform (Hermes, OpenClaw, others).

## Repository layout
- `mcp/` -> portable MCP server implementation (core)
- `docs/` -> contracts and platform docs
- `integrations/hermes/` -> Hermes-specific skill + setup
- `integrations/openclaw/` -> OpenClaw-specific setup/playbook

## Current status
- Core MCP scaffold exists (`mcp/server.py`)
- Tool contracts defined (`docs/mcp-tool-contracts.md`)
- Hermes skill adapter moved under `integrations/hermes/skills/`
- OpenClaw adapter scaffolding added

## Planned MCP tools
- `siradig_healthcheck`
- `siradig_login`
- `siradig_select_taxpayer`
- `siradig_get_personal_data`
- `siradig_list_forms`
- `siradig_open_form_pdf`

## Required environment variables
- `ARCA_CUIT`
- `ARCA_PASSWORD`
- `ARCA_SIRADIG_USER_FULLNAME`

## Next iteration
1. Implement real browser automation behind MCP tools.
2. Add stable JSON error codes and typed responses.
3. Add integration examples for Hermes + OpenClaw configs.
4. Prepare publish artifacts (license, tags, release notes).
