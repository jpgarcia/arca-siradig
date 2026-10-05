# ARCA SiRADIG CLI

CLI for signing in to ARCA and managing **SiRADIG - Trabajador** Form 572 drafts:
inspect personal data, employers and deductions; add or remove supported receipts;
preview, print and submit a form to the employer.

## Installation

Use Node.js 20.17+ (20.x), 22.13+ (22.x), or 23.5+. Run the published CLI with
`npx`:

```bash
npx arca-siradig --help
```

Before the first login, install the Chromium version required by the CLI's Playwright
dependency. The browser is cached for subsequent commands:

```bash
npx --yes --package=arca-siradig playwright install chromium
npx arca-siradig login
npx arca-siradig form summary --period 2026
```

Alternatively, install the command globally:

```bash
npm install --global arca-siradig
arca-siradig --help
```

For development from a local checkout:

```bash
npm ci
npx playwright install chromium
npm run build
```

Optionally create a local `.env` file:

```bash
ARCA_CUIT=<your-cuit-or-cuil>
ARCA_PASSWORD=<your-tax-password>
```

`.env` and its local variants are ignored by Git; `.env.example` contains empty defaults.
The CLI uses populated values as prompt defaults; the password is masked and can be
accepted by pressing `enter`. Prefer the interactive password prompt. If you create a
populated `.env`, keep it private (for example, `chmod 600 .env` on macOS/Linux).

## Usage

Examples below use `arca-siradig` directly after a global installation or local link.
When using `npx`, prefix each command with `npx`.

To make a local checkout available as a command outside its folder, build it and link it:

```bash
npm run build
npm link
arca-siradig --help
```

This links the local package without publishing it to npm. Run `npm run build` again after
changing the TypeScript sources. A local assistant with terminal access can invoke this
command and reuse the session created by `arca-siradig login` under the same OS user.
Use `--format=json` for supported read commands. The CLI accepts structured receipt fields
through `form deductions add-item-receipt`; it does not extract fields from PDF or image files.
An assistant must interpret the document before calling that command.

```bash
npm run arca-siradig
```

This prints help by default. Append `--help` to a command or subcommand to see its options,
without signing in or executing the command:

```bash
arca-siradig login --help
arca-siradig employees show --help
arca-siradig form deductions --help
```

Playwright runs headless by default. To log in with a visible browser, pass:

```bash
npm run arca-siradig -- login --headless false
```

## Commands

```bash
npm run arca-siradig -- login
npm run arca-siradig -- logout
npm run arca-siradig -- persons list
npm run arca-siradig -- persons select <id|name>
npm run arca-siradig -- persons list --format=json
npm run arca-siradig -- personal-data show [--person "<id|name>"]
npm run arca-siradig -- employees list [--person "<id|name>"]
npm run arca-siradig -- employees show [--person "<id|name>"] --employee-cuit <cuit>
npm run arca-siradig -- form deductions list [--person "<id|name>"]
npm run arca-siradig -- form deductions list-receipt-types
npm run arca-siradig -- form deductions show <id> [--person "<id|name>"]
npm run arca-siradig -- form deductions add-item --period=<YYYY> --type=<type> --cuit=<provider-cuit> --month=<1-12> --amount=<amount>
npm run arca-siradig -- form deductions add-item-receipt --period=<YYYY> --type=<type> --cuit=<provider-cuit> --month=<1-12> --amount=<amount> --receipt-type=<id> --date=<YYYY-MM-DD> --number=<number>
npm run arca-siradig -- form deductions add-item-receipt --period=<YYYY> --type=gastos-medicos --cuit=<provider-cuit> --month=<1-12> --amount=<amount> --reimbursed-amount=<amount> --receipt-type=<id> --date=<YYYY-MM-DD> --number=<number>
npm run arca-siradig -- form deductions remove-item-receipt --period=<YYYY> --cuit=<provider-cuit> --number=<number>
npm run arca-siradig -- --interactive
```

`login` prompts for missing CUIT/CUIL or password values. After a successful login, the CLI
stores Playwright session state in `~/.arca-siradig/session.json` and never stores the
password. It also selects the first available SiRADIG person automatically and stores that
selection. If no people are listed, the CLI keeps the session but asks you to add a person in
ARCA before continuing.

`--cuit` and `--password` are available for automation, but password arguments can be
recorded in shell history and exposed in process listings. Use the prompt for manual login.

Login uses the SiRADIG fiscal-key entry linked from `https://www.afip.gob.ar/572web/`
(`login.xhtml?action=SYSTEM&system=radig`). If authentication opens SiRADIG directly,
the CLI skips the portal service selector. Portal navigation remains a fallback.

`logout` removes the stored session file.

`persons list` reuses the stored session. If there is no session or ARCA has expired it, run
`arca-siradig login` again. The default output format is text; pass `--format=json` for JSON.

`persons select` accepts either the person id or the person name shown by `persons list`.

`personal-data show`, `employees list`, `employees show`, `form deductions list`, and
`form deductions show` reuse the stored session and will use the stored selected person when
available. You can still pass `--person` to override it. All five commands support
`--format=text|json`.

`employees list` and `form deductions list` first read the portal's embedded JSON through
authenticated HTTP requests, reducing browser navigation. The employer lookup for
`employees show` uses the same path. If ARCA changes the response or the session expires,
the CLI falls back to its browser flow. Login and person selection still use Playwright.

`form deductions list-receipt-types` prints the hardcoded `cmpTipo` catalog used by the
portal. Text output shows an `ID`/`Tipo` table and JSON output returns `{ id, name }`
objects.

`form deductions show <id>` first resolves the item from the grouped deductions list, then
opens the read-only detail page for that exact record. Text output mirrors the web view with
entity, period, monthly detail, and receipts sections. JSON output is structured in English
with normalized months, amounts, receipt dates, and numeric receipt type ids.

`form deductions add-item` and `form deductions add-item-receipt` identify the target deduction by
provider CUIT plus deduction type. For monthly-detail deductions, use the type shown by
`form deductions list` and the provider CUIT shown in the same row.

`form deductions add-item-receipt --type=gastos-medicos` loads a medical expense receipt by
provider CUIT and month. If the same provider/month already exists in `form deductions list`, the
CLI opens that item; otherwise it opens `verGastosMedicos.do`, fills the provider CUIT,
selects the month, adds the receipt, and saves the draft.

`form deductions remove-item-receipt` currently removes `gastos-medicos` receipts by provider
CUIT and receipt number. It searches all matching provider entries, removes the matching
receipt row, and saves the draft.

## Fiscal Forms

```bash
arca-siradig form show --period 2026 --format=json
arca-siradig form deductions list --period 2026 --format=json
arca-siradig form summary --period 2026
arca-siradig form summary --period 2026 --format=json
arca-siradig form print --period 2026 --path ./f572-2026.pdf
arca-siradig form print --period 2026 --path ./
```

All form commands accept `--person <id|name>` and otherwise use the stored selected person.
Read commands may omit `--period`: they report the fiscal year actually selected by ARCA,
without assuming that it is the latest year. An explicit period is selected through the
worker entry and verified against the portal breadcrumb; unavailable periods fail.
These commands access the current form draft, not historical submitted versions.

`form show` reports person and period. `form summary` reads the official HTML draft preview,
including presentation character, withholding agent, section tables, and the totals displayed
by ARCA. It preserves ARCA's amounts and labels without recalculating tax or deductible limits.
The console summary highlights official totals and groups monthly amounts by category and
provider. Empty sections are condensed rather than printing their empty table headers.
Colors are enabled for terminals and disabled for redirected output or `NO_COLOR`.

`form print` uses the official **Imprimir Borrador** download and validates that it is a PDF.
`--path` accepts a PDF filename or a directory (`./`, an existing directory, a path ending
in `/`, or a new path without an extension). Directories use `f572-<year>-borrador.pdf`.
Parent directories are created as needed. Existing names receive ` (1)`, ` (2)`, etc.
before the extension, including explicit filenames. Files use private permissions and are
never overwritten; the CLI always prints the absolute path of the saved file.

Changes (`add-item`, `add-item-receipt`, `remove-item-receipt`) require `--period`.
Receipt dates must belong to that year. The CLI verifies the represented
person and fiscal year before changing a form. Session refresh restores this context for
form reads before retrying navigation.

`form deductions list` JSON is `{ period, person: { id, name }, deductions: [...] }`;
detail JSON is
`{ period, person: { id, name }, deduction: {...} }`. Text output includes person and year.
The static receipt-type catalog retains its existing output and does not accept a period.

### Submit to the employer

```bash
arca-siradig form submit --period 2026
arca-siradig form submit --period 2026 --aceptar
arca-siradig form submit --period 2026 --aceptar --format=json
```

`form submit` shows the official draft summary, opens ARCA's confirmation dialog, and asks
**Aceptar — Generar Presentación** or **Cancelar** in the terminal. Cancel is the default;
interrupting the prompt also cancels. `--aceptar` skips the terminal question and confirms
**Generar Presentación** directly. Submission always requires `--period` and supports
`--person`. Without a terminal, `--aceptar` is required.

The CLI verifies person and year again immediately before the final click and never retries
that click automatically. Results report `submitted`, `cancelled`, `rejected`, or
`unconfirmed`. Success requires a positive acknowledgement or a newly registered
presentation. When that wording is unknown, the CLI checks **Consulta de Formularios Enviados**
against a snapshot taken immediately before the final click. It verifies person and
period and requires exactly one new record with the next presentation number; a
presentation already present before the attempt never confirms success. A confirmed
history result includes the presentation number, description, and sending date.
If neither check can confirm the result, inspect that history in ARCA before trying
again. The message includes the final screen URL without query parameters and the
reason history could not confirm the attempt. Rejected or unconfirmed results exit with code 1.
The summary and prompt use stderr so JSON results remain a single stdout object.

Confirmation and result handling have been tested with mocked HTML. Read-only live
inspection confirmed the history structure after a user-initiated CLI submission;
development did not generate another live presentation.

## Interactive Flow

Run the current read-only interactive flow with:

```bash
npm run arca-siradig -- --interactive
```

The flow:

1. Prompts for CUIT/CUIL and tax password.
2. Signs in to ARCA.
3. Prompts again if ARCA rejects the credentials.
4. Opens the `SiRADIG - Trabajador` service.
5. Automatically accepts the draft reminder if it appears.
6. Lists the people available to represent.
7. Selects the person for the current browser session; interactive mode does not persist it.
8. Shows the main menu with all actions disabled except `Datos Personales`.
9. Shows personal data grouped by section.

## Scripts

```bash
npm run build
npm run check
npm run format
npm test
```

## Development Inspection

For portal markup changes or new read-only features, use:

```bash
npx tsx scripts/inspect-live.ts
```

This opens visible Chromium, uses credentials from `.env`, navigates read-only through the
worker flow, and writes HTML summaries and screenshots to a randomly named directory under
the OS temporary directory. The path is printed even if inspection fails. On macOS/Linux,
the directory has mode `0700` and files have mode `0600` from creation.
Captures include personal tax data; keep them private, remove them when finished, and build
test fixtures from synthetic data instead of copying captured responses.

## V1 Limitations

- Writes support monthly deduction items and receipts; medical expense receipts also support removal.
- `form submit` sends a presentation to the employer after confirmation, or with `--aceptar`.
- Only `Datos Personales` is enabled in the interactive menu.
- Tests are offline with mocked HTML; they do not run a live ARCA sign-in.
- `logout` only removes the stored session; it does not close browser sessions that are already open.

## Privacy and Packaging

The session file contains CUIT/CUIL, the person selection and authenticated browser state.
Treat it as a credential. The CLI never adds the tax password to this file. Session writes
replace the file atomically with mode `0600`; reading an older file repairs its permissions
and those of the session directory (`0700`) on macOS/Linux. Login and CLI errors redact
password values, including escaped browser call logs.

Console output, JSON exports and downloaded PDFs contain the requested personal tax data.
The default PDF names, copied session files, inspection directories, local environment
variants and package archives are ignored by Git. This does not replace checking any custom
export path before committing. All committed test fixtures use fictional identifiers and data.

`npm pack` runs a clean build through `prepack`. The package contains only compiled runtime
JavaScript and declarations, `package.json`, README and LICENSE. Tests, development tools,
environment files and source maps are excluded. Check the contents with:

```bash
npm pack --dry-run
```

## License

[ISC](LICENSE).
