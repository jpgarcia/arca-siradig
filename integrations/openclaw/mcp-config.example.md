# OpenClaw MCP config example (conceptual)

Use stdio transport pointing to:
- command: `python3`
- args: `/opt/data/vaults/personal/Projects/arca-siradig/mcp/server.py`

Expose env vars to runtime:
- `ARCA_CUIT`
- `ARCA_PASSWORD`
- `ARCA_SIRADIG_USER_FULLNAME`

After registration, validate by calling:
- `tools/list`
- `tools/call` -> `siradig_healthcheck`

Note:
OpenClaw config syntax can vary by version; keep this as transport contract reference.
