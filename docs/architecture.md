# Current Architecture

## Summary

V1 is a command-based CLI with an optional interactive mode. It combines console prompts
with Playwright, and the automation pieces are intentionally decoupled so they can later
be reused from headless commands, skills, or an MCP server.

## Modules

- `src/cli/`: command parser, command dispatch, prompts, and console rendering.
- `src/cli/help.ts`: declarative help pages and a shared renderer for aligned command
  and option tables, wrapped descriptions, and shell-safe multiline examples.
- `src/files/pdf.ts`: PDF destination validation, directory defaults, and exclusive creation
  of numbered filenames without overwriting existing documents.
- `src/files/private.ts`: private directory/file creation and atomic replacement of sensitive files.
- `src/security/errors.ts`: secret redaction for literal, JSON-escaped and URL-encoded diagnostics.
- `src/cli/errors.ts`: CLI error formatting with password arguments and environment defaults redacted.
- `src/arca/session.ts`: browser/context/page setup, sign-in, and SiRADIG service opening.
- `src/arca/http.ts`: allowlisted authenticated HTTP consultations and parsing of inline
  JSON without executing portal scripts. It shares the Playwright request context.
- `src/arca/persons.ts`: reminder modal handling, person listing, and person selection.
- `src/arca/form.ts`: fiscal context verification, official draft-preview extraction, and PDF download.
- `src/arca/submission.ts`: portal confirmation, cancellation, single-attempt presentation
  generation, and conservative result classification.
- `src/arca/submitted-forms.ts`: read-only sent-form history and comparison of presentation
  IDs and versions before and after submission.
- `src/arca/menu.ts`: main menu listing and `Datos Personales` selection.
- `src/arca/personal-data.ts`: grouped personal data extraction.
- `src/arca/employees.ts`: employer list extraction and employer detail navigation/extraction.
- `src/arca/receipt-types.ts`: hardcoded `cmpTipo` catalog used by deduction receipt listings.
- `src/session/store.ts`: local `~/.arca-siradig/session.json` persistence for Playwright
  `storageState`.
- `src/types.ts`: shared internal contracts.
- `scripts/inspect-live.ts`: read-only live inspection helper for collecting portal markup
  during development.

## Flow

1. The CLI shows help by default, or dispatches `login`, `persons list`,
   `personal-data show`, `employees list`, `employees show`, `form deductions list`,
   `form deductions list-receipt-types`, `form deductions show`, `form deductions add-item`,
   `form deductions add-item-receipt`, or `--interactive`.
   After parsing flags, `--help` takes precedence over command execution, interactive
   mode, and required command arguments. Subcommand help therefore never needs a stored
   session or opens a browser.
2. `login` prompts for missing credentials, opens SiRADIG, auto-selects the first listed
   person when available, and stores Playwright `storageState` plus selected person.
3. Session-backed person commands reuse stored session state and print text or JSON.
4. `--interactive` loads `.env` and prompts for credentials with optional defaults.
5. A headless Chromium Playwright session is created unless `--headless false` is passed.
6. Sign-in starts at `login.xhtml?action=SYSTEM&system=radig`, the fiscal-key link
   published by the official `https://www.afip.gob.ar/572web/` microsite.
   It waits for either the password step or a visible ARCA error after submitting
   CUIT/CUIL, then for SiRADIG, the authenticated portal, or an error after submitting
   the password. A direct SiRADIG landing bypasses portal service lookup. If ARCA
   lands in the portal instead, service opening matches the complete visible SiRADIG - Trabajador label on links,
   buttons, or cards, ignoring hidden duplicates and label capitalization/dash variants. The CLI keeps the returned
   page, including popup pages. It expands `Ver Todos` when the service is not visible.
   Login waits for the returned SiRADIG person-selection page instead of immediately
   navigating away during service authentication; an unexpected page fails before saving
   the session instead of being reported as an empty person list. If service opening or
   person selection lands in Empleador (`/radig_emp/`), the CLI
   navigates to the worker entry `determinarContribuyente.do?codigo=<current year>`
   using the same browser session. It waits for the worker menu or person selector,
   reselects the requested person when needed, and limits recovery to one attempt.
   Only the worker workflow (`/radig/`) is supported.
7. People are extracted from `input.btn_empresa`.
8. Personal data and employer detail fieldsets inside `#contenido` are extracted and printed.
9. Employer lists are extracted from `#nueva_tabla_empleadores`, and employer details are
   opened read-only through `verEmpleador.do?id=...`.
   CLI employer listing and the list lookup preceding employer detail first read
   `datosEmpleadoresJSON` from the menu response via HTTP; browser parsing is the fallback.
10. Deductions are extracted from `#div_tabla_deducciones_agrupadas` and typed from the
    edit URL of each group.
    CLI deduction listing first reads `datosDeduccionesAgrupadasJSON` via HTTP, preserving
    the existing output schema and type mapping. Browser parsing remains the fallback.
11. `form deductions list-receipt-types` prints the hardcoded `cmpTipo` catalog used by the
    portal.
12. `form deductions show` resolves the item from the grouped list, opens the detail URL
    with the record id, and extracts entity, period, monthly detail, and receipts from the
    detail page DOM. JSON receipts carry the numeric receipt type id while text output keeps
    the portal label.
13. `form deductions add-item` and the default `form deductions add-item-receipt` path resolve the
    target record by deduction type plus provider CUIT, use the live modal markup in
    `verCuotasMedicoAsistenciales.do`, and finish by pressing the page-level `Guardar`
    button after adding a monthly detail or receipt.
14. `form deductions add-item-receipt --type=gastos-medicos` first tries to open the matching
    `gastos-medicos` row for the same provider CUIT and month from the grouped deductions
    list, otherwise opens
    `verGastosMedicos.do` directly, fills the provider CUIT, selects the month, adds the
    receipt with reimbursed amount, and saves the draft.
15. `form deductions remove-item-receipt` currently supports `gastos-medicos` by provider CUIT
    and receipt number. It scans matching provider entries, removes the matching receipt row,
    and saves the draft.

## CLI Help

All help topics use the same page structure and rendering functions in `src/cli/help.ts`.
Command syntax and arguments share one label column; descriptions align to a single
column across commands, command options, and global options on each page. Padding is
computed on plain text before applying ANSI styles. The renderer uses the terminal width
(100 columns for redirected output), wraps continuations under their descriptions, and
stacks labels and descriptions when there is insufficient room for two columns. Example
commands wrap between arguments with shell continuation backslashes so they remain
copyable. Option names and argument values are never split in the middle.

Help documents the flags accepted by the parser. `--interactive` starts the read-only
interactive workflow, and `--headless <true|false>` controls browser visibility. Unsupported
`--debug` and `--version` flags are no longer advertised. Person selection requires a
positional ID or name, and employer details require `--employee-cuit`.

## Form Context and Preview

`form` groups the fiscal-year workflow, including deduction commands under `form deductions`.
Form reads expose the represented person and actual fiscal year;
form writes require an explicit `--period` and support `--person`. The receipt date must
match the requested year. Personal-data and employer commands keep their existing interface.

`selectFormPeriod` reads the person from `#encabezado_usuario` and the year from
`#breadCrumb0`. If another year is requested it navigates to
`determinarContribuyente.do?codigo=<year>`, handles a returned person selector, and verifies
both fields afterward. The person-selector ID may be an internal index such as `0`,
not a CUIT. The CLI passes the selected person's name for the initial header check and
keeps their selector ID for reselection. Once verified, the header CUIT is bound across
period changes and session refresh. Identity errors show the expected and actual person,
year, and commands to inspect or override the selection. The URL alone is not evidence of the selected year. Unavailable
periods and mismatched contexts fail before writes. Read retries after session expiry
reselect the person and year rather than using ARCA's default form.

`form show` exposes that context. `form summary` opens `vistaPreviaFormulario.do` and reads
`#contenido`: the official section headings, direct rows of nested `tabla_vista_previa`
tables, totals labeled `Importe Total`, presentation character, and withholding agent.
Nested table containers are excluded to avoid duplicate rows. Each section reports whether
it contains actual data (leaf data cells or subtotal rows), allowing console rendering to
collapse empty sections while preserving the complete tables in JSON. Console layout lives
in `src/cli/render.ts` and groups totals, categories, providers and monthly detail with
terminal-width wrapping and optional colors. No totals or tax limits are
computed locally. The summary describes the draft, even when its character is rectificative.

`form print --path` clicks `#btn_imprimir_borrador` and waits for Playwright's download
rather than reproducing PDF generation redirects. It checks the `%PDF-` signature,
resolves the destination through `src/files/pdf.ts`, writes a new file with mode 0600,
and deletes the temporary browser download. Directory paths use
`f572-<year>-borrador.pdf`; existing filenames receive ` (1)`, ` (2)`, etc. Exclusive
creation prevents collisions between concurrent downloads. Parent directories are created
as needed, and the returned absolute path is always printed after a successful save. The inspected handler targets `generarBorradorPDF.do`.

The submission button opens `#confirmacion_generacion_presentacion`; its confirmation
navigates to `generacion_presentacion.jsp`.
`form submit --period <year>` now uses this browser flow. The CLI renders the summary,
then supplies a confirmation callback from `src/cli/prompts.ts` to `submitForm`; navigation
logic contains no interactive dependencies. The callback defaults to cancellation and
handles prompt interruption as cancellation. `--aceptar` bypasses the callback and directly
confirms the portal dialog; it is restricted to this command. Nonterminal execution requires
that explicit flag. Person and fiscal year are reverified immediately before generation.

Read-only preparation can refresh the session. Final presentation generation has no retry
path. A response timeout or unknown layout attempts history verification and returns
`unconfirmed` if it cannot confirm the result. Immediately before the final click, a separate page
in the same authenticated context reads `verFormulariosEnviados.do`. It verifies person
and fiscal year and parses `#tabla_formularios` rows with `data-id-reg`, public presentation
number, description, and sending date. This preserves the preview and confirmation dialog.
The preview context is verified again after that read, immediately before generation.

Explicit positive acknowledgements classify success, while visible portal errors and
negative acknowledgements classify rejection. When the final wording is unknown, one
read-only history consultation can confirm success if all prior records remain and exactly
one new ID has the next presentation number. Old records, multiple additions, mismatched
contexts, unavailable history, and missing baselines remain unconfirmed. A history-confirmed
result includes `confirmationSource: "sent-forms"`, the public number as `reference`,
`submissionType`, and `submittedAt`. An unconfirmed result includes the final URL without
query parameters and explains why history could not confirm it. No retry of generation is
performed. History snapshots are held in memory and never persisted.

Read-only live inspection confirmed that the user's prior CLI submission appeared in history
despite its unrecognized final response. Development did not generate another live
presentation. Mocked tests cover acknowledgement and history-based confirmation.
Rejected and unconfirmed results exit with code 1. Summary and prompts go to stderr,
leaving stdout available for one structured JSON result.

## Privacy and Release Builds

`loginToArca` catches errors at the credential boundary. It redacts the CUIT and password,
including JSON-escaped values in Playwright call logs, and creates a new error without
retaining the original cause. Credential rejection retains its `ArcaLoginError` type.
CLI error formatting also redacts all supplied password arguments and the environment
default. Parser errors do not echo option assignment values or the complete argument list.
Password flags remain available, but prompts avoid putting secrets into shell history or
process arguments.

The session store persists only its approved top-level fields. It enforces mode `0700` on
the directory, writes a uniquely named temporary file with mode `0600`, then atomically
renames it over `session.json`. This repairs permissive existing files and avoids partially
written JSON. Reads also repair legacy permissions. These modes apply to macOS/Linux;
Windows protection depends on filesystem access controls.

Live inspection reuses the production login and portal opening functions. Its read-only
captures are deliberately raw development artifacts, not shareable fixtures. Each run uses
a private random directory under the OS temporary directory, printed before browser work.
HTML, JSON and screenshot buffers are written exclusively with private permissions from
creation. All committed fixtures use fictional names, addresses, identifiers and amounts.

The development TypeScript configuration checks runtime code, tests and inspection tools.
`scripts/build.mjs` performs that check, removes stale output, then compiles only runtime
sources through `tsconfig.build.json`, without source maps. `prepack` runs this clean build.
The package files allowlist includes runtime JavaScript/declarations, README and LICENSE;
npm also includes `package.json`. Tests and their compiled data, development tools,
environment files, source maps and inspection captures are not shipped.

## Future Extension

See [HTTP inspection](http-inspection.md) for observed routes, supported JSON schemas,
verification limits, and browser steps that still need investigation. HTTP consultation
failures fall back to navigation so the existing session refresh continues to apply.

Future commands should keep reusing `src/arca/` functions behind thin CLI dispatchers.
Session reuse is already built around persisted Playwright `storageState`, so new read-only
commands should first try to compose on top of that instead of introducing parallel auth
paths.

Future code identifiers should stay in English. Spanish ARCA labels may remain only when
they are user-visible portal text, selector text, or part of ARCA's domain vocabulary.
