# OpenClaw integration (scaffold)

This folder documents how to consume the portable `mcp/server.py` from OpenClaw.

## Status
- Scaffold only (v0.1)
- Pending: concrete OpenClaw config examples and playbook format

## Expected usage
1. Register the MCP server command in OpenClaw config.
2. Ensure env vars are available in runtime:
   - ARCA_CUIT
   - ARCA_PASSWORD
   - ARCA_SIRADIG_USER_FULLNAME
3. Call MCP tools:
   - siradig_login
   - siradig_select_taxpayer
   - siradig_get_personal_data
   - siradig_list_forms
   - siradig_open_form_pdf
