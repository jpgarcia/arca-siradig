# Agent Instructions

This project implements a TypeScript CLI for ARCA SiRADIG automation with Playwright.
It supports consultation, draft changes and explicitly confirmed form submission.

## Principles

- Keep scraping/navigation logic separate from interactive prompts.
- Do not store CUIT/CUIL values, tax passwords, cookies, or storage state without an
  explicit product decision.
- The current product decision is to store Playwright `storageState` in
  `~/.arca-siradig/session.json` after `arca-siradig login`; never store passwords.
- Prefer reusable functions in `src/arca/` for future headless commands or MCP support.
- Do not run live ARCA smoke tests unless explicitly requested.
- Use mocked HTML in tests to validate selectors and parsers.
- Use only fictional names, addresses, identifiers, financial amounts and receipts in fixtures.
- Redact credentials at the login boundary and when formatting CLI errors; do not retain
  original credential-bearing errors as causes.
- Session files and inspection captures must have private permissions. Keep captures out
  of Git and npm packages; they contain personal tax data.
- Treat `scripts/inspect-live.ts` as a read-only development tool. It may navigate,
  accept informational reminders, and capture markup, but it must not save, submit, or
  edit data in ARCA.

## Expected Commands

```bash
npm run build
npm run check
npm test
```

## Conventions

- TypeScript ESM with `.js` imports.
- Biome for formatting and linting.
- Headless Playwright browser for the interactive CLI by default; pass `--headless false`
  when visible browser debugging is needed. Tests use headless Playwright.
- Bare `arca-siradig` should show help. Use `--interactive` for the read-only interactive
  workflow.
- Document architecture changes in `docs/architecture.md`.
- `npm pack` must clean/rebuild runtime output and publish only the `package.json` files
  allowlist. Never add session state, environment files, fixtures or inspection outputs.
- Keep project code identifiers in English. ARCA-owned labels such as `Datos Personales`
  may remain in Spanish when they are portal text or selectors.
