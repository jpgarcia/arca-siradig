# arca-siradig

MVP repository for a publishable ARCA/AFIP SiRADIG MCP + skill.

## Scope (v0.1)
- Create project baseline in Obsidian Projects
- Define MCP tool contracts
- Provide a Python stdio MCP server scaffold
- Provide skill that references MCP usage

## Current status
- Repository initialized
- First version scaffolded
- MCP server is a scaffold (not production-ready yet)

## Planned MCP tools
- siradig_login
- siradig_select_taxpayer
- siradig_get_personal_data
- siradig_list_forms
- siradig_open_form_pdf

## Required environment variables (Hermes .env)
- ARCA_CUIT
- ARCA_PASSWORD
- ARCA_SIRADIG_USER_FULLNAME

## Next iteration
1. Implement real browser automation behind MCP tools (Playwright)
2. Persist authenticated session/context
3. Add robust selector fallbacks and structured error codes
4. Add tests and publishing metadata
