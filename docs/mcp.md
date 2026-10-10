# Local SiRADIG MCP

The package exposes an MCP server through `arca-siradig mcp`, using the official
TypeScript MCP SDK and stdio. It has no HTTP listener, remote session exchange, or hosted
backend. `arca-siradig` without arguments still shows CLI help; existing commands keep
their flags, output formats, and confirmation behavior.

## Setup

MCP is available starting with version 1.1.0. Before its npm publication, use the
[local checkout](#local-checkout) below.

```bash
npx --yes --package=arca-siradig@1.1.0 playwright install chromium
npx arca-siradig@1.1.0 login
```

Configure your client to launch `npx -y arca-siradig@1.1.0 mcp`. The client owns the stdin
and stdout pipes; running the server in a terminal by itself waits for MCP messages.
Use the same OS user for login and the MCP, because both use
`~/.arca-siradig/session.json`. There are no credentials in the MCP configuration.

The SDK supports clients using both legacy initialization and current protocol
negotiation. A client must support local stdio servers. General web chats that only
accept hosted connectors cannot launch this process.

### Claude Desktop and JSON-based clients

Merge this entry into the existing `mcpServers` object:

```json
{
  "mcpServers": {
    "arca-siradig": {
      "command": "npx",
      "args": ["-y", "arca-siradig@1.1.0", "mcp"]
    }
  }
}
```

Claude Desktop's configuration is at
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or
`%APPDATA%\Claude\claude_desktop_config.json` on Windows. Restart the client after editing.
Other clients may use different configuration locations or a UI for command and args.
See the [official local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

### Claude Code

```bash
claude mcp add --transport stdio --scope user arca-siradig -- npx -y arca-siradig@1.1.0 mcp
claude mcp list
```

`--scope user` makes the configuration available across projects for your OS user.
See [Claude Code's MCP documentation](https://code.claude.com/docs/en/mcp).

### Codex

```bash
codex mcp add arca-siradig -- npx -y arca-siradig@1.1.0 mcp
codex mcp list
```

Equivalent entry in `~/.codex/config.toml`:

```toml
[mcp_servers.arca-siradig]
command = "npx"
args = ["-y", "arca-siradig@1.1.0", "mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 120
```

The larger timeouts allow initial package startup and browser navigation. Codex interfaces
that share this local configuration can use the server. This does not configure a hosted
ChatGPT web connector. See [Codex's MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Local checkout

```bash
npm ci
npx playwright install chromium
npm run build
node dist/src/cli/index.js login
```

Configure the client with absolute paths to your Node executable and compiled entry:

```json
{
  "mcpServers": {
    "arca-siradig": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/arca-siradig/dist/src/cli/index.js", "mcp"]
    }
  }
}
```

Find your Node executable with `command -v node` on macOS/Linux or `where node` on
Windows. Use Windows paths in the same JSON structure when appropriate. Run
`npm run build` again after editing sources and restart the client's MCP connection.
An existing `npm link` also exposes `arca-siradig mcp` with the same compiled entry.

## Tools

Every tool returns JSON as text and `structuredContent`. Forms include the verified
person's CUIT and the actual fiscal year. Person-selection IDs may be internal indices
such as `0`; obtain them from `siradig_persons_list`.

| Tool | Purpose | Inputs |
| --- | --- | --- |
| `siradig_session_status` | Saved-session metadata; does not authenticate with ARCA | None |
| `siradig_persons_list` | Representable people | None |
| `siradig_person_select` | Persist the selected person, without changing tax data | `person` |
| `siradig_personal_data` | Personal data | Optional `person` |
| `siradig_employers_list` | Employers | Optional `person` |
| `siradig_employer_show` | Employer details | `cuit`; optional `person` |
| `siradig_form_show` | Verified person and year | Optional `person`, `period` |
| `siradig_form_summary` | Official draft preview and totals | Optional `person`, `period` |
| `siradig_form_print` | Official draft PDF saved locally; returns absolute path | `path`; optional `person`, `period` |
| `siradig_deductions_list` | Deductions with IDs and provider CUITs | Optional `person`, `period` |
| `siradig_deduction_show` | Monthly detail and receipts | `id`; optional `person`, `period` |
| `siradig_receipt_types` | Static receipt-type IDs | None |

Read tools default to the stored person and ARCA's selected year, and report the actual
context. Pass both explicitly when inspecting a particular form. Print paths accept a
filename or directory, use private permissions, and add numbered suffixes instead of
overwriting files. The PDF stays on the MCP host; a chat needs separate local-file support
to attach or open it.

## Draft changes

Append `--allow-writes` to the launch arguments to expose three additional tools:

```json
"args": ["-y", "arca-siradig@1.1.0", "mcp", "--allow-writes"]
```

| Tool | Required fields |
| --- | --- |
| `siradig_deduction_add_monthly_item` | `person`, `period`, `deductionType`, `cuit`, `month`, `amount` |
| `siradig_deduction_add_receipt` | Same fields plus `date`, `receiptType`, `number`; `reimbursedAmount` for `gastos-medicos` |
| `siradig_deduction_remove_receipt` | `person`, `period`, `cuit`, `number`; medical expenses only |

The AI interprets the user's receipt attachment, reviews the extracted fields with them,
looks up the target deduction and receipt-type ID, then passes those fields to the tool.
Amounts are strings without thousands separators (`"1234.56"` or `"1234,56"`); dates are
real ISO dates (`"2026-03-15"`) matching the requested month and year. CUITs contain eleven
digits. Medical expenses require an explicit reimbursement, including `"0"`.

Tool annotations identify draft mutations as non-idempotent changes. `--allow-writes`
enables those tools for the whole MCP process; it is not a per-operation human approval.
The client controls its own tool approvals. Successful calls report
`draft-change-attempted`; query deductions again to verify the saved result. Failures report
uncertainty and must not be automatically retried, since a save may already have completed.

Sending a form to an employer remains a separate, explicitly confirmed CLI action:

```bash
npx arca-siradig@1.1.0 form submit --period 2026
```

There is no MCP submission tool in this version. The MCP never invokes CLI prompts or
submits a presentation while reading or changing a draft.

## Sessions and privacy

Login stays in the terminal. The MCP has no password, cookie, or storage-state input tool.
It reloads the stored session for each operation, so after a session expires you can log
in again and retry a consultation without restarting the server. Session metadata reports
`not-checked` until a real ARCA consultation validates it; file existence is not treated
as authenticated access. Status metadata continues to report `not-checked`; each ARCA
consultation verifies access as needed.

Operations within one server are serialized to avoid overlapping person/year selection,
and each browser is closed after its operation. Read-only session recovery preserves the
selected person and year and retries at most once. Draft mutations have no automatic
retry. Serialization is per server process, not a lock across multiple clients or CLI
processes sharing the same session.

Session files retain the CLI's private permissions. Tool responses expose the requested
tax data to the AI client and, depending on that client's setup, its model provider. Local
session custody does not mean that tool results stay private from the chat. Unexpected
browser errors are replaced with safe diagnostics rather than returning raw headers,
cookies, or portal captures.

## Troubleshooting

- `SESSION_REQUIRED` or `SESSION_EXPIRED`: run `arca-siradig login` in the terminal under
  the same OS user as the MCP, then retry the consultation.
- `PERSON_REQUIRED` or `PERSON_NOT_FOUND`: use `siradig_persons_list`, then
  `siradig_person_select`, or pass the listed ID/name explicitly.
- `OPERATION_FAILED`: verify person and year with `form show --period <year>` in the CLI.
  For visible browser diagnosis, use the CLI's `--headless false` option.
- `DRAFT_CHANGE_UNCONFIRMED`: inspect deductions before attempting another change.
- Missing browser executable: install Chromium using the matching package version from
  the setup section.
- `npx`/`node` not found: desktop apps may not inherit your shell's Node version manager
  environment. Use absolute executable paths or the local-checkout configuration.
- Help appears instead of tools: include `mcp` in the client's launch arguments. Bare CLI
  behavior remains help.

Tests exercise protocol connections and synthetic portal HTML; they do not authenticate
with live ARCA.
