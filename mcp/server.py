#!/usr/bin/env python3
"""
ARCA SiRADIG MCP server (portable-first, stdio JSON lines).

v0.7:
- MCP-style methods: initialize, tools/list, tools/call
- Functional browser tools using Playwright:
  - siradig_healthcheck
  - siradig_reset_session
  - siradig_login
  - siradig_list_taxpayers
  - siradig_session_status
  - siradig_select_taxpayer
  - siradig_get_personal_data
- Placeholder tools kept for next iterations:
  - siradig_list_forms
  - siradig_open_form_pdf
"""

from __future__ import annotations

import atexit
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

REQUIRED_ENV = [
    "ARCA_CUIT",
    "ARCA_PASSWORD",
]

AFIP_LOGIN_URL = "https://auth.afip.gob.ar/contribuyente_/login.xhtml"
SIRADIG_MENU_URL = "https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp"
SESSION_DIR = Path(__file__).resolve().parent / ".session"
SESSION_STATE_PATH = SESSION_DIR / "storage_state.json"

TOOLS: List[Dict[str, Any]] = [
    {
        "name": "siradig_healthcheck",
        "description": "Validate required environment variables and server readiness.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "siradig_login",
        "description": "Authenticate in ARCA and navigate to SiRADIG taxpayer selection page.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "headless": {"type": "boolean"},
                "timeout_ms": {"type": "integer", "minimum": 5000, "maximum": 120000},
                "force_fresh": {"type": "boolean"},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "siradig_reset_session",
        "description": "Close runtime browser state and remove persisted Playwright storage_state, forcing a fresh login on next siradig_login.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "siradig_list_taxpayers",
        "description": "List selectable taxpayer entries currently visible in menu_sel_empresa.jsp.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "siradig_session_status",
        "description": "Check whether ARCA/SiRADIG session is currently active and report persisted-state metadata.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "siradig_select_taxpayer",
        "description": "Select taxpayer context by full name and wait for determinarContribuyente page.",
        "inputSchema": {
            "type": "object",
            "properties": {"full_name": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "siradig_get_personal_data",
        "description": "Read visible header fields (Usuario, Representando a, Dependencia).",
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

_BROWSER_STATE: Dict[str, Any] = {
    "playwright": None,
    "browser": None,
    "context": None,
    "page": None,
    "headless": None,
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ok(data: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, "data": data}


def fail(code: str, message: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"ok": False, "error": {"code": code, "message": message}}
    if details:
        payload["error"]["details"] = details
    return payload


def check_env() -> Dict[str, Any]:
    missing = [k for k in REQUIRED_ENV if not os.getenv(k)]
    if missing:
        return fail("missing_env", f"Missing required env vars: {', '.join(missing)}")
    return ok(
        {
            "ready": True,
            "checked_at": _utc_now(),
            "required_env": REQUIRED_ENV,
            "server_version": "0.7.0",
        }
    )


def _get_timeout_ms(arguments: Dict[str, Any]) -> int:
    timeout = arguments.get("timeout_ms")
    if isinstance(timeout, int) and 5000 <= timeout <= 120000:
        return timeout
    return 35000


def _bool_from_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _close_browser_state() -> None:
    try:
        if _BROWSER_STATE["context"] is not None:
            _BROWSER_STATE["context"].close()
    except Exception:
        pass
    try:
        if _BROWSER_STATE["browser"] is not None:
            _BROWSER_STATE["browser"].close()
    except Exception:
        pass
    try:
        if _BROWSER_STATE["playwright"] is not None:
            _BROWSER_STATE["playwright"].stop()
    except Exception:
        pass

    _BROWSER_STATE["playwright"] = None
    _BROWSER_STATE["browser"] = None
    _BROWSER_STATE["context"] = None
    _BROWSER_STATE["page"] = None
    _BROWSER_STATE["headless"] = None


atexit.register(_close_browser_state)


def _load_storage_state_path() -> Optional[str]:
    if SESSION_STATE_PATH.exists() and SESSION_STATE_PATH.is_file():
        return str(SESSION_STATE_PATH)
    return None


def _save_storage_state() -> None:
    context = _BROWSER_STATE.get("context")
    if context is None:
        return
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    context.storage_state(path=str(SESSION_STATE_PATH))


def _delete_storage_state() -> bool:
    if not SESSION_STATE_PATH.exists():
        return False
    SESSION_STATE_PATH.unlink(missing_ok=True)
    return True


def _session_state_info() -> Dict[str, Any]:
    if not SESSION_STATE_PATH.exists():
        return {"persisted": False}
    stat = SESSION_STATE_PATH.stat()
    return {
        "persisted": True,
        "storage_state_path": str(SESSION_STATE_PATH),
        "updated_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
    }


def _is_logged_in_page(page) -> bool:
    try:
        text = (page.locator("body").inner_text(timeout=5000) or "").lower()
    except Exception:
        text = ""
    if "usuario no logueado" in text:
        return False
    if "menu_sel_empresa.jsp" in page.url or "determinarcontribuyente.do" in page.url.lower():
        return True
    return "usuario" in text and "dependencia" in text


def _ensure_page(headless: bool, use_storage_state: bool = True):
    if (
        _BROWSER_STATE["page"] is not None
        and _BROWSER_STATE["browser"] is not None
        and _BROWSER_STATE["headless"] == headless
    ):
        return _BROWSER_STATE["page"]

    _close_browser_state()
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "Playwright is not available. Install dependencies with: pip install -r requirements.txt && python -m playwright install chromium"
        ) from e

    pw = sync_playwright().start()
    browser = pw.chromium.launch(headless=headless)
    storage_state_path = _load_storage_state_path() if use_storage_state else None
    if storage_state_path:
        context = browser.new_context(storage_state=storage_state_path)
    else:
        context = browser.new_context()
    page = context.new_page()

    _BROWSER_STATE["playwright"] = pw
    _BROWSER_STATE["browser"] = browser
    _BROWSER_STATE["context"] = context
    _BROWSER_STATE["page"] = page
    _BROWSER_STATE["headless"] = headless
    return page


def _fill_first(page, selectors: List[str], value: str, timeout_ms: int) -> bool:
    for selector in selectors:
        locator = page.locator(selector)
        if locator.count() > 0:
            try:
                locator.first.fill(value, timeout=timeout_ms)
                return True
            except Exception:
                continue
    return False


def _click_first(page, selectors: List[str], timeout_ms: int) -> bool:
    for selector in selectors:
        locator = page.locator(selector)
        if locator.count() > 0:
            try:
                locator.first.click(timeout=timeout_ms)
                return True
            except Exception:
                continue
    return False


def _extract_field(text: str, label: str) -> Optional[str]:
    pattern = rf"{re.escape(label)}\s*:?\s*(.+)"
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    return match.group(1).strip()


def _list_visible_taxpayers(page) -> List[str]:
    names: List[str] = []

    submit_inputs = page.locator("input[type='submit'][value]")
    for i in range(submit_inputs.count()):
        value = (submit_inputs.nth(i).get_attribute("value") or "").strip()
        if value:
            names.append(value)

    for locator in [page.locator("button"), page.locator("a")]:
        count = locator.count()
        for i in range(count):
            text = (locator.nth(i).inner_text() or "").strip()
            if text and len(text) >= 5:
                names.append(text)

    deduped: List[str] = []
    for n in names:
        if n not in deduped:
            deduped.append(n)

    ignored_tokens = ["ingresar", "siguiente", "salir", "inicio", "siradig"]
    filtered = [
        n
        for n in deduped
        if not any(tok in n.lower() for tok in ignored_tokens)
        and any(ch.isalpha() for ch in n)
        and len(n.split()) >= 2
    ]
    return filtered[:30]


def _open_siradig_service(page, timeout_ms: int) -> bool:
    tile_selectors = [
        "text=SiRADIG - Trabajador",
        "text=SiRADIG",
        "a:has-text('SiRADIG - Trabajador')",
        "a:has-text('SiRADIG')",
        "button:has-text('SiRADIG - Trabajador')",
        "button:has-text('SiRADIG')",
    ]
    return _click_first(page, tile_selectors, timeout_ms)


def _ensure_siradig_menu(page, timeout_ms: int) -> bool:
    if "menu_sel_empresa.jsp" in page.url:
        return True

    try:
        page.goto(SIRADIG_MENU_URL, wait_until="domcontentloaded", timeout=timeout_ms)
    except Exception:
        pass

    if "menu_sel_empresa.jsp" in page.url:
        return True

    _open_siradig_service(page, timeout_ms)
    page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
    if "menu_sel_empresa.jsp" not in page.url:
        page.goto(SIRADIG_MENU_URL, wait_until="domcontentloaded", timeout=timeout_ms)

    return "menu_sel_empresa.jsp" in page.url


def siradig_reset_session(_: Dict[str, Any]) -> Dict[str, Any]:
    _close_browser_state()
    deleted = _delete_storage_state()
    return ok(
        {
            "reset": True,
            "deleted_persisted_state": deleted,
            "session": _session_state_info(),
        }
    )


def siradig_login(arguments: Dict[str, Any]) -> Dict[str, Any]:
    env_check = check_env()
    if not env_check.get("ok"):
        return env_check

    timeout_ms = _get_timeout_ms(arguments)
    headless = arguments.get("headless")
    if not isinstance(headless, bool):
        headless = _bool_from_env("ARCA_PLAYWRIGHT_HEADLESS", True)
    force_fresh = bool(arguments.get("force_fresh", False))

    cuit = os.getenv("ARCA_CUIT", "").strip()
    password = os.getenv("ARCA_PASSWORD", "").strip()

    try:
        if force_fresh:
            _close_browser_state()
            _delete_storage_state()

        page = _ensure_page(headless=headless, use_storage_state=not force_fresh)

        # Reuse persisted session when still valid.
        try:
            menu_ready = _ensure_siradig_menu(page, timeout_ms)
            if menu_ready and _is_logged_in_page(page):
                taxpayers = _list_visible_taxpayers(page)
                return ok(
                    {
                        "logged_in": True,
                        "reused_session": True,
                        "headless": headless,
                        "current_url": page.url,
                        "title": page.title(),
                        "menu_expected": "menu_sel_empresa.jsp",
                        "available_taxpayers": taxpayers,
                        "session": _session_state_info(),
                    }
                )
        except Exception:
            pass

        page.goto(AFIP_LOGIN_URL, wait_until="domcontentloaded", timeout=timeout_ms)

        cuit_ok = _fill_first(
            page,
            [
                "input[name='cuit']",
                "input[name='username']",
                "#F1\\:username",
                "input[id*='username']",
                "input[type='text']",
            ],
            cuit,
            timeout_ms,
        )
        if not cuit_ok:
            return fail("selector_not_found", "Could not find CUIT input on AFIP login page")

        next_clicked = _click_first(
            page,
            [
                "button:has-text('Siguiente')",
                "input[value='Siguiente']",
                "#F1\\:btnSiguiente",
                "button[type='submit']",
                "input[type='submit']",
            ],
            timeout_ms,
        )
        if not next_clicked:
            return fail("selector_not_found", "Could not find Siguiente/submit button after CUIT")

        page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)

        password_ok = _fill_first(
            page,
            [
                "input[type='password']",
                "input[name='password']",
                "#F1\\:password",
                "input[id*='password']",
            ],
            password,
            timeout_ms,
        )
        if not password_ok:
            return fail("selector_not_found", "Could not find password input after CUIT step")

        login_clicked = _click_first(
            page,
            [
                "button:has-text('Ingresar')",
                "input[value='Ingresar']",
                "button[type='submit']",
                "input[type='submit']",
            ],
            timeout_ms,
        )
        if not login_clicked:
            return fail("selector_not_found", "Could not find Ingresar/submit button for password step")

        page.wait_for_load_state("networkidle", timeout=timeout_ms)
        menu_ready = _ensure_siradig_menu(page, timeout_ms)
        if not menu_ready or not _is_logged_in_page(page):
            return fail(
                "login_incomplete",
                "Login finished but SiRADIG menu was not reachable/verified",
                {"current_url": page.url},
            )

        taxpayers = _list_visible_taxpayers(page)
        if not taxpayers:
            return fail(
                "login_without_taxpayers",
                "Login succeeded but no selectable taxpayers were detected",
                {"current_url": page.url},
            )

        _save_storage_state()

        return ok(
            {
                "logged_in": True,
                "reused_session": False,
                "headless": headless,
                "current_url": page.url,
                "title": page.title(),
                "menu_expected": "menu_sel_empresa.jsp",
                "available_taxpayers": taxpayers,
                "session": _session_state_info(),
            }
        )
    except Exception as e:
        return fail("login_failed", "Failed during ARCA login flow", {"exception": str(e)})


def siradig_list_taxpayers(_: Dict[str, Any]) -> Dict[str, Any]:
    page = _BROWSER_STATE.get("page")
    if page is None:
        return fail("session_not_ready", "No active browser session. Call siradig_login first")

    try:
        menu_ready = _ensure_siradig_menu(page, 30000)
        if not menu_ready or not _is_logged_in_page(page):
            return fail(
                "session_not_logged_in",
                "Session is not currently on a valid SiRADIG logged-in menu",
                {"current_url": page.url},
            )

        taxpayers = _list_visible_taxpayers(page)
        if not taxpayers:
            return fail(
                "no_taxpayers_found",
                "No selectable taxpayers were found on current SiRADIG selector page",
                {"current_url": page.url},
            )
        return ok({"current_url": page.url, "taxpayers": taxpayers})
    except Exception as e:
        return fail("list_taxpayers_failed", "Failed listing taxpayers", {"exception": str(e)})


def siradig_session_status(arguments: Dict[str, Any]) -> Dict[str, Any]:
    headless = arguments.get("headless")
    if not isinstance(headless, bool):
        headless = _bool_from_env("ARCA_PLAYWRIGHT_HEADLESS", True)

    try:
        page = _ensure_page(headless=headless)
        _ensure_siradig_menu(page, 20000)
        logged_in = _is_logged_in_page(page)
        taxpayers = _list_visible_taxpayers(page) if logged_in else []
        return ok(
            {
                "logged_in": logged_in,
                "current_url": page.url,
                "available_taxpayers": taxpayers,
                "session": _session_state_info(),
            }
        )
    except Exception as e:
        return fail(
            "session_status_failed",
            "Failed checking ARCA/SiRADIG session status",
            {"exception": str(e), "session": _session_state_info()},
        )


def siradig_select_taxpayer(arguments: Dict[str, Any]) -> Dict[str, Any]:
    full_name = (arguments.get("full_name") or os.getenv("ARCA_SIRADIG_USER_FULLNAME", "")).strip()
    if not full_name:
        return fail("missing_full_name", "Missing full_name argument and ARCA_SIRADIG_USER_FULLNAME env var")

    page = _BROWSER_STATE.get("page")
    if page is None:
        return fail("session_not_ready", "No active browser session. Call siradig_login first")

    try:
        _ensure_siradig_menu(page, 30000)

        taxpayers = _list_visible_taxpayers(page)
        target_lower = full_name.lower()
        matched_name = next((t for t in taxpayers if t.lower() == target_lower), None)
        if matched_name is None:
            matched_name = next((t for t in taxpayers if target_lower in t.lower() or t.lower() in target_lower), None)

        click_name = matched_name or full_name
        candidates = [
            page.locator(f"input[type='submit'][value='{click_name}']"),
            page.get_by_role("button", name=click_name),
            page.get_by_role("link", name=click_name),
            page.locator(f"text={click_name}"),
        ]

        clicked = False
        for locator in candidates:
            if locator.count() > 0:
                locator.first.click(timeout=30000)
                clicked = True
                break

        if not clicked:
            return fail(
                "taxpayer_not_found",
                f"Could not find selectable taxpayer button/link for '{full_name}'",
                {"available_taxpayers": taxpayers},
            )

        page.wait_for_load_state("networkidle", timeout=30000)
        return ok(
            {
                "selected_full_name": click_name,
                "requested_full_name": full_name,
                "current_url": page.url,
                "expected_path_hint": "determinarContribuyente.do",
            }
        )
    except Exception as e:
        return fail("select_taxpayer_failed", "Failed selecting taxpayer context", {"exception": str(e)})


def siradig_get_personal_data(_: Dict[str, Any]) -> Dict[str, Any]:
    page = _BROWSER_STATE.get("page")
    if page is None:
        return fail("session_not_ready", "No active browser session. Call siradig_login first")

    try:
        page.wait_for_load_state("domcontentloaded", timeout=20000)
        body_text = page.locator("body").inner_text(timeout=10000)

        usuario = _extract_field(body_text, "Usuario")
        representando = _extract_field(body_text, "Representando a")
        dependencia = _extract_field(body_text, "Dependencia")

        if not any([usuario, representando, dependencia]):
            return fail(
                "personal_data_not_found",
                "Could not parse header fields from current page",
                {"current_url": page.url},
            )

        return ok(
            {
                "current_url": page.url,
                "usuario": usuario,
                "representando_a": representando,
                "dependencia": dependencia,
            }
        )
    except Exception as e:
        return fail("get_personal_data_failed", "Failed reading personal data", {"exception": str(e)})


def tool_not_implemented(name: str) -> Dict[str, Any]:
    return fail("not_implemented", f"Tool '{name}' is defined but not implemented yet")


def handle_tool(name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    if name == "siradig_healthcheck":
        return check_env()
    if name == "siradig_reset_session":
        return siradig_reset_session(arguments)
    if name == "siradig_login":
        return siradig_login(arguments)
    if name == "siradig_list_taxpayers":
        return siradig_list_taxpayers(arguments)
    if name == "siradig_session_status":
        return siradig_session_status(arguments)
    if name == "siradig_select_taxpayer":
        return siradig_select_taxpayer(arguments)
    if name == "siradig_get_personal_data":
        return siradig_get_personal_data(arguments)

    if name in {"siradig_list_forms", "siradig_open_form_pdf"}:
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
            "serverInfo": {"name": "arca-siradig", "version": "0.7.0"},
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
