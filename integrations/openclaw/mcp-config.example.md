# OpenClaw MCP config example (conceptual)

Use stdio transport pointing to:
- command: `python3`
- args: `/opt/data/vaults/personal/Projects/arca-siradig/mcp/server.py`

Expose required env vars to runtime:
- `ARCA_CUIT`
- `ARCA_PASSWORD`

Optional env var:
- `ARCA_SIRADIG_USER_FULLNAME` (fallback when `full_name` is omitted in `siradig_select_taxpayer`)

After registration, validate by calling:
- `tools/list`
- `tools/call` -> `siradig_healthcheck`

Note:
OpenClaw config syntax can vary by version; keep this as transport contract reference.
