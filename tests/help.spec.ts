import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify, stripVTControlCharacters } from "node:util";
import { expect, test } from "@playwright/test";
import { renderHelp } from "../src/cli/help.js";
import { type HelpCommand, parseCliOptions } from "../src/cli/options.js";

const topics: HelpCommand["topic"][] = [
  "root",
  "login",
  "logout",
  "persons",
  "personal-data",
  "employees",
  "form",
  "deductions",
];

test("all help tables align descriptions across commands and options, with or without color", () => {
  for (const topic of topics) {
    for (const width of [80, 100, 120]) {
      const plain = renderHelp(topic, { width });
      expect(stripVTControlCharacters(renderHelp(topic, { width, color: true }))).toBe(plain);
      let inTable = false;
      const descriptionColumns: number[] = [];
      for (const line of plain.split("\n")) {
        if (/^ {2}(?:Commands|Options|Global Options):$/.test(line)) inTable = true;
        else if (!line) inTable = false;
        else if (inTable) {
          const row = line.match(/^ {4}(\S.*?) {2,}(\S.*)$/);
          if (row) descriptionColumns.push(line.length - row[2].length);
        }
        expect(line.length, `${topic}: ${line}`).toBeLessThanOrEqual(width);
        expect(line.trimEnd()).toBe(line);
      }
      expect(descriptionColumns.length).toBeGreaterThan(0);
      expect(new Set(descriptionColumns).size, topic).toBe(1);
    }
  }
});

test("help remains readable in narrow terminals and examples retain valid shell continuations", () => {
  for (const topic of topics) {
    for (const width of [40, 60]) {
      const help = renderHelp(topic, { width });
      for (const line of help.split("\n"))
        expect(line.length, `${topic}: ${line}`).toBeLessThanOrEqual(width);
      const examples = help.match(/^ {4}\$ arca-siradig[^\n]*(?:\n {6}[^\n]*)*/gm) ?? [];
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        const args = example
          .replace(/ \\\n {6}/g, " ")
          .trim()
          .split(/\s+/)
          .slice(2);
        // Parse the displayed command without executing it or contacting ARCA.
        expect(parseCliOptions(args).kind).not.toBe("help");
      }
    }
  }
  expect(renderHelp("deductions", { width: 40 })).toContain(
    "    --reimbursed-amount <amount>\n      Required",
  );
});

test("help documents implemented flags and required arguments accurately", () => {
  const root = renderHelp("root");
  expect(root).toContain("Start the interactive read-only workflow");
  expect(root).toContain("--headless <true|false>");
  expect(root).not.toMatch(/^ {4}deductions\b/m);
  expect(renderHelp("form")).toContain("deductions <command>");
  for (const topic of topics) {
    expect(renderHelp(topic)).not.toMatch(/--debug|--version|Skip confirmation prompt/);
    expect(renderHelp(topic)).toContain("-h, --help");
  }
  expect(renderHelp("persons")).toContain("select <id|name>");
  expect(renderHelp("persons")).not.toContain("--person");
  expect(renderHelp("employees")).toContain("show --employee-cuit <cuit>");
  expect(renderHelp("form")).toContain("--aceptar");
  expect(renderHelp("deductions")).toContain("show <id>");
});

test("help takes precedence over subcommands and their required arguments", () => {
  const commands: Array<{ args: string[]; topic: HelpCommand["topic"] }> = [
    { args: [], topic: "root" },
    { args: ["--interactive"], topic: "root" },
    { args: ["login"], topic: "login" },
    { args: ["logout"], topic: "logout" },
    { args: ["persons", "list"], topic: "persons" },
    { args: ["persons", "select"], topic: "persons" },
    { args: ["persons", "select", "0"], topic: "persons" },
    { args: ["personal-data", "show"], topic: "personal-data" },
    { args: ["employees", "list"], topic: "employees" },
    { args: ["employees", "show"], topic: "employees" },
    ...["show", "summary", "print", "submit"].map((command) => ({
      args: ["form", command],
      topic: "form" as const,
    })),
    ...[
      "list",
      "list-receipt-types",
      "show",
      "add-item",
      "add-item-receipt",
      "remove-item-receipt",
    ].map((command) => ({ args: ["form", "deductions", command], topic: "deductions" as const })),
  ];
  for (const { args, topic } of commands) {
    for (const flag of ["--help", "-h"]) {
      expect(parseCliOptions([...args, flag])).toEqual({ kind: "help", headless: true, topic });
      expect(parseCliOptions([flag, ...args])).toEqual({ kind: "help", headless: true, topic });
    }
  }
});

test("the actual CLI prints every help page without needing a session or credentials", async () => {
  const entrypoint = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));
  const cliEnvironment: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  delete cliEnvironment.FORCE_COLOR;
  for (const topic of topics) {
    const args =
      topic === "root"
        ? ["--help"]
        : topic === "deductions"
          ? ["form", "deductions", "--help"]
          : [topic, "--help"];
    expect(parseCliOptions(args).kind).toBe("help");
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", entrypoint, ...args],
      { env: cliEnvironment },
    );
    expect(stdout.trimEnd()).toBe(renderHelp(topic));
    expect(stderr).toBe("");
  }
});
