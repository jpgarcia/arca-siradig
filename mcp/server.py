#!/usr/bin/env python3
"""
ARCA SiRADIG MCP server scaffold (stdio JSON-RPC style).

v0.1: contract-first scaffold. Tool handlers currently return not_implemented.
"""

import json
import os
import sys
from typing import Any, Dict

REQUIRED_ENV = [
    "ARCA_CUIT",
    "ARCA_PASSWORD",
    "ARCA_SIRADIG_USER_FULLNAME",
]


def ok(data: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, "data": data}


def fail(code: str, message: str) -> Dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}


def check_env() -> Dict[str, Any]:
    missing = [k for k in REQUIRED_ENV if not os.getenv(k)]
    if missing:
        return fail("missing_env", f"Missing required env vars: {', '.join(missing)}")
    return ok({"ready": True})


def tool_not_implemented(name: str) -> Dict[str, Any]:
    return fail("not_implemented", f"Tool '{name}' is defined but not implemented in v0.1")


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


def main() -> int:
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
        except json.JSONDecodeError:
            print(json.dumps(fail("invalid_json", "Input is not valid JSON")), flush=True)
            continue

        tool = req.get("tool")
        args = req.get("arguments", {})
        if not tool:
            print(json.dumps(fail("invalid_request", "Missing 'tool' field")), flush=True)
            continue

        resp = handle_tool(tool, args)
        print(json.dumps(resp, ensure_ascii=False), flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
