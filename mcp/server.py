#!/usr/bin/env python3
"""
ARCA SiRADIG MCP server (portable-first, stdio JSON lines).

v0.2:
- Adds MCP-style methods: initialize, tools/list, tools/call
- Implements functional read-only baseline tools:
  - siradig_healthcheck
- Keeps siradig_* browser tools as explicit not_implemented placeholders

Notes:
- Real SiRADIG interaction will be implemented in a next iteration using
  browser automation behind this interface.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List

REQUIRED_ENV = [
    "ARCA_CUIT",
    "ARCA_PASSWORD",
    "ARCA_SIRADIG_USER_FULLNAME",
]

TOOLS: List[Dict[str, Any]] = [
    {
        "name": "siradig_healthcheck",
        "description": "Validate required environment variables and server readiness.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "siradig_login",
        "description": "Authenticate in ARCA and enter SiRADIG (SSO path).",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "siradig_select_taxpayer",
        "description": "Select taxpayer context by full name.",
        "inputSchema": {
            "type": "object",
            "properties": {"full_name": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "siradig_get_personal_data",
        "description": "Read visible user fields from verDatosPersonales.do.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "siradig_list_forms",
        "description": "List submitted forms for visible period or requested year.",
        "inputSchema": {
            "type": "object",
            "properties": {"year": {"type": "integer"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "siradig_open_form_pdf",
        "description": "Open/download submitted form PDF by table row or identifier.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "row_index": {"type": "integer"},
                "form_identifier": {"type": "string"},
            },
            "additionalProperties": False,
        },
    },
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ok(data: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, "data": data}


def fail(code: str, message: str) -> Dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}


def check_env() -> Dict[str, Any]:
    missing = [k for k in REQUIRED_ENV if not os.getenv(k)]
    if missing:
        return fail("missing_env", f"Missing required env vars: {', '.join(missing)}")
    return ok(
        {
            "ready": True,
            "checked_at": _utc_now(),
            "required_env": REQUIRED_ENV,
            "server_version": "0.2.0",
        }
    )


def tool_not_implemented(name: str) -> Dict[str, Any]:
    return fail("not_implemented", f"Tool '{name}' is defined but not implemented yet")


def handle_tool(name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    if name == "siradig_healthcheck":
        return check_env()

    if name in {
        "siradig_login",
        "siradig_select_taxpayer",
        "siradig_get_personal_data",
        "siradig_list_forms",
        "siradig_open_form_pdf",
    }:
        return tool_not_implemented(name)

    return fail("unknown_tool", f"Unknown tool: {name}")


def response(id_value: Any, result: Dict[str, Any] | None = None, error: Dict[str, Any] | None = None) -> Dict[str, Any]:
    base = {"jsonrpc": "2.0", "id": id_value}
    if error is not None:
        base["error"] = error
    else:
        base["result"] = result
    return base


def mcp_initialize(req_id: Any) -> Dict[str, Any]:
    return response(
        req_id,
        result={
            "protocolVersion": "2024-11-05",
            "serverInfo": {"name": "arca-siradig", "version": "0.2.0"},
            "capabilities": {"tools": {}},
        },
    )


def mcp_tools_list(req_id: Any) -> Dict[str, Any]:
    return response(req_id, result={"tools": TOOLS})


def mcp_tools_call(req_id: Any, params: Dict[str, Any]) -> Dict[str, Any]:
    name = params.get("name")
    arguments = params.get("arguments", {}) or {}
    if not name:
        return response(req_id, error={"code": -32602, "message": "Missing tool name"})

    tool_result = handle_tool(name, arguments)
    return response(
        req_id,
        result={
            "content": [{"type": "text", "text": json.dumps(tool_result, ensure_ascii=False)}],
            "isError": not tool_result.get("ok", False),
        },
    )


def handle_request(req: Dict[str, Any]) -> Dict[str, Any]:
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {}) or {}

    if method == "initialize":
        return mcp_initialize(req_id)
    if method == "tools/list":
        return mcp_tools_list(req_id)
    if method == "tools/call":
        return mcp_tools_call(req_id, params)

    return response(req_id, error={"code": -32601, "message": f"Method not found: {method}"})


def main() -> int:
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
        except json.JSONDecodeError:
            print(
                json.dumps(
                    response(None, error={"code": -32700, "message": "Parse error: invalid JSON"}),
                    ensure_ascii=False,
                ),
                flush=True,
            )
            continue

        resp = handle_request(req)
        print(json.dumps(resp, ensure_ascii=False), flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
