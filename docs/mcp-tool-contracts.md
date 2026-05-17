# MCP tool contracts (v0.1)

All tools return JSON with this envelope:

{
  "ok": true|false,
  "data": { ... },
  "error": {
    "code": "...",
    "message": "..."
  }
}

## siradig_login
Input: {}
Behavior:
- Reads ARCA_CUIT and ARCA_PASSWORD from env
- Authenticates in ARCA portal
- Enters SiRADIG via "SiRADIG - Trabajador"
Output data:
- current_url
- session_state

## siradig_list_taxpayers
Input: {}
Behavior:
- Ensures current session is on `menu_sel_empresa.jsp`
- Lists selectable taxpayer names shown in buttons/links/submit inputs
Output data:
- taxpayers (array)
- current_url

## siradig_session_status
Input: {}
Behavior:
- Reuses/opens browser context and checks whether session appears logged in
- Reports persisted Playwright storage-state metadata
Output data:
- logged_in (bool)
- current_url
- available_taxpayers (when logged in)
- session (persisted-state metadata)

## siradig_select_taxpayer
Input:
- full_name (optional; defaults ARCA_SIRADIG_USER_FULLNAME)
Behavior:
- Opens menu_sel_empresa.jsp within authenticated context
- Selects matching taxpayer row/button
Output data:
- selected_full_name
- current_url

## siradig_get_personal_data
Input: {}
Behavior:
- Navigates to verDatosPersonales.do
- Extracts visible fields
Output data:
- fields (key/value map)
- source_url

## siradig_list_forms
Input:
- year (optional int)
Behavior:
- Opens verFormulariosEnviados.do
- If year passed: clicks "consultar otro período", picks year, clicks "consultar"
- Lists visible forms
Output data:
- visible_period
- forms (array)

## siradig_open_form_pdf
Input:
- row_index OR form_identifier
Behavior:
- Clicks print icon on selected row
- Returns opened URL or downloaded file path
Output data:
- pdf_url
- file_path (optional)
