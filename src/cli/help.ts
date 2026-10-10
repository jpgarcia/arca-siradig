import { VERSION } from "../version.js";
import type { HelpCommand } from "./options.js";

type HelpRow = readonly [label: string, description: string];
type HelpExample = { description: string; args: string[] };
type HelpPage = {
  usage: string;
  description: string;
  commands?: HelpRow[];
  options?: HelpRow[];
  notes?: string[];
  examples?: HelpExample[];
};

const PERSON_OPTION: HelpRow = ["--person <id|name>", "Override the stored person selection"];
const FORMAT_OPTION: HelpRow = ["--format <text|json>", "Output format (default: text)"];
const PERIOD_OPTION: HelpRow = ["--period <YYYY>", "Fiscal year; required for changes"];
const GLOBAL_OPTIONS: HelpRow[] = [
  ["-h, --help", "Show command help"],
  ["--headless <true|false>", "Run without a visible browser (default: true)"],
];

const HELP_PAGES: Record<HelpCommand["topic"], HelpPage> = {
  root: {
    usage: "arca-siradig [options] <command>",
    description: "Manage ARCA SiRADIG sessions, people and fiscal forms.",
    commands: [
      ["login", "Log into ARCA and store the session"],
      ["logout", "Remove the stored session"],
      ["persons <command>", "List people or select a person"],
      ["personal-data <command>", "Read personal data"],
      ["employees <command>", "Read employer data"],
      ["form <command>", "Inspect, print or submit a fiscal form"],
      ["mcp", "Start the local MCP server over stdio"],
    ],
    options: [["-i, --interactive", "Start the interactive read-only workflow"]],
    notes: ["Run arca-siradig <command> --help for command details."],
    examples: [
      { description: "Log in", args: ["login"] },
      { description: "Read a form summary", args: ["form", "summary", "--period=2026"] },
    ],
  },
  mcp: {
    usage: "arca-siradig mcp [options]",
    description: "Start a local MCP server for compatible AI clients, reusing the CLI session.",
    options: [["--allow-writes", "Enable draft changes; employer submission stays in the CLI"]],
    notes: [
      "Log in separately with arca-siradig login. Never share your tax password with the AI client.",
      "stdout is reserved for MCP messages. Configure the client to launch this command over stdio.",
      "Consultations are enabled by default. Draft changes require explicit person and fiscal year.",
    ],
    examples: [
      { description: "Start the server for consultations", args: ["mcp"] },
      { description: "Enable draft changes", args: ["mcp", "--allow-writes"] },
    ],
  },
  login: {
    usage: "arca-siradig login [options]",
    description: "Log into ARCA and store the session. Missing credentials are prompted for.",
    options: [
      ["--cuit <cuit>", "ARCA CUIT/CUIL"],
      ["--password <password>", "ARCA tax password"],
    ],
    notes: [
      "Prefer the password prompt. --password values may appear in shell history and process arguments.",
    ],
    examples: [
      { description: "Enter credentials interactively", args: ["login"] },
      { description: "Log in with a visible browser", args: ["login", "--headless=false"] },
    ],
  },
  logout: {
    usage: "arca-siradig logout",
    description: "Remove the stored session from ~/.arca-siradig/session.json.",
    examples: [{ description: "Remove the local session", args: ["logout"] }],
  },
  persons: {
    usage: "arca-siradig persons <command> [options]",
    description: "Manage people and the stored person selection.",
    commands: [
      ["list", "List the available people"],
      ["select <id|name>", "Select a person by the listed ID or name"],
    ],
    options: [["--format <text|json>", "Output format for list (default: text)"]],
    notes: ["The listed selection ID may be an internal index, rather than a CUIT."],
    examples: [
      { description: "List people", args: ["persons", "list"] },
      { description: "Select a person by ID", args: ["persons", "select", "0"] },
    ],
  },
  "personal-data": {
    usage: "arca-siradig personal-data <command> [options]",
    description: "Read personal data for the selected person.",
    commands: [["show [person]", "Show the personal data sections visible in SiRADIG"]],
    options: [PERSON_OPTION, FORMAT_OPTION],
    examples: [{ description: "Show personal data", args: ["personal-data", "show"] }],
  },
  employees: {
    usage: "arca-siradig employees <command> [options]",
    description: "Read employer information for the selected person.",
    commands: [
      ["list [person]", "List employers"],
      ["show --employee-cuit <cuit>", "Show one employer by CUIT"],
    ],
    options: [
      PERSON_OPTION,
      ["--employee-cuit <cuit>", "Employer CUIT; required for show"],
      FORMAT_OPTION,
    ],
    examples: [
      { description: "List employers", args: ["employees", "list"] },
      {
        description: "Show an employer",
        args: ["employees", "show", "--employee-cuit=30000000001"],
      },
    ],
  },
  form: {
    usage: "arca-siradig form <command> [options]",
    description: "Inspect, print or submit the selected person's fiscal form draft.",
    commands: [
      ["show", "Show the represented person and selected fiscal year"],
      ["summary", "Read the official draft preview"],
      ["print --path <file|folder>", "Download the official draft PDF"],
      ["submit --period <YYYY>", "Send the form; prompts to accept or cancel"],
      ["deductions <command>", "List, inspect, add or remove deductions"],
    ],
    options: [
      PERSON_OPTION,
      PERIOD_OPTION,
      ["--path <file|folder>", "PDF destination; required for print"],
      ["--aceptar", "Confirm Generar Presentación without a prompt; submit only"],
      ["--format <text|json>", "Output format for show, summary and submit (default: text)"],
    ],
    notes: [
      "Read commands may omit --period and report ARCA's selected fiscal year.",
      "Directory destinations use f572-<year>-borrador.pdf. Existing filenames get (1), (2), etc.",
      "Submission requires --period. Without an interactive terminal, --aceptar is also required.",
      "Run arca-siradig form deductions --help for deduction commands.",
    ],
    examples: [
      { description: "Read a draft summary", args: ["form", "summary", "--period=2026"] },
      {
        description: "Save the draft PDF in the current directory",
        args: ["form", "print", "--period=2026", "--path=./"],
      },
      {
        description: "Review and confirm submission interactively",
        args: ["form", "submit", "--period=2026"],
      },
    ],
  },
  deductions: {
    usage: "arca-siradig form deductions <command> [options]",
    description: "Read deductions or update the selected fiscal form draft.",
    commands: [
      ["list", "List deductions for the selected person"],
      ["list-receipt-types", "List the receipt type catalog"],
      ["show <id>", "Show one deduction by ID"],
      ["add-item", "Add a monthly deduction item"],
      ["add-item-receipt", "Add a receipt to a deduction"],
      ["remove-item-receipt", "Remove a medical expense receipt"],
    ],
    options: [
      PERIOD_OPTION,
      PERSON_OPTION,
      ["--type <type>", "Deduction type; required for add-item and add-item-receipt"],
      ["--cuit <cuit>", "Provider CUIT; required for changes"],
      ["--month <1-12>", "Month number; required for add-item and add-item-receipt"],
      ["--amount <amount>", "Amount; required for add-item and add-item-receipt"],
      ["--date <YYYY-MM-DD>", "Receipt date; required for add-item-receipt"],
      ["--receipt-type <id>", "Receipt type ID; required for add-item-receipt"],
      ["--number <value>", "Receipt number; required for adding or removing receipts"],
      ["--reimbursed-amount <amount>", "Required for medical expense receipts (gastos-medicos)"],
      ["--format <text|json>", "Output format for list, show and receipt types (default: text)"],
    ],
    notes: [
      "Changes require --period. Receipt dates must belong to that fiscal year.",
      "The receipt type catalog does not accept --period.",
      "remove-item-receipt currently supports gastos-medicos; --type defaults to that type.",
    ],
    examples: [
      { description: "List deductions", args: ["form", "deductions", "list", "--period=2026"] },
      { description: "List receipt types", args: ["form", "deductions", "list-receipt-types"] },
      { description: "Show a deduction", args: ["form", "deductions", "show", "123"] },
      {
        description: "Add a monthly item",
        args: [
          "form",
          "deductions",
          "add-item",
          "--period=2026",
          "--type",
          "cuotas-medico-asistenciales",
          "--cuit=30000000001",
          "--month=3",
          "--amount=1234",
        ],
      },
      {
        description: "Add a receipt to a monthly deduction",
        args: [
          "form",
          "deductions",
          "add-item-receipt",
          "--period=2026",
          "--type",
          "cuotas-medico-asistenciales",
          "--cuit=30000000001",
          "--month=3",
          "--amount=1234",
          "--receipt-type=6",
          "--date=2026-03-12",
          "--number=0000300000222",
        ],
      },
      {
        description: "Add a medical expense receipt",
        args: [
          "form",
          "deductions",
          "add-item-receipt",
          "--period=2026",
          "--type=gastos-medicos",
          "--cuit=30000000001",
          "--month=5",
          "--amount=28000",
          "--reimbursed-amount=0",
          "--receipt-type=6",
          "--date=2026-05-22",
          "--number=0000300000222",
        ],
      },
      {
        description: "Remove a medical expense receipt",
        args: [
          "form",
          "deductions",
          "remove-item-receipt",
          "--period=2026",
          "--cuit=30000000001",
          "--number=0000300000428",
        ],
      },
    ],
  },
};

export function renderHelp(
  topic: HelpCommand["topic"],
  options: { width?: number; color?: boolean; version?: string } = {},
): string {
  const page = HELP_PAGES[topic];
  const width = Math.max(20, Math.floor(options.width ?? 100));
  const styled = (text: string, code: string) =>
    options.color ? `\u001b[${code}m${text}\u001b[0m` : text;
  const globals = topic === "logout" ? GLOBAL_OPTIONS.slice(0, 1) : GLOBAL_OPTIONS;
  const sections = [
    { title: "Commands", rows: page.commands ?? [] },
    { title: "Options", rows: page.options ?? [] },
    { title: "Global Options", rows: globals },
  ];
  const labelWidth = Math.max(
    ...sections.flatMap((section) => section.rows.map(([label]) => label.length)),
  );
  const descriptionColumn = 4 + labelWidth + 2;
  const stacked = width - descriptionColumn < 24;
  const lines: string[] = [styled(`ARCA SiRADIG CLI ${options.version ?? VERSION}`, "38;5;245")];
  const append = (text: string, indent: number, style?: string) => {
    for (const line of wrapHelpText(text, width - indent))
      lines.push(" ".repeat(indent) + (style ? styled(line, style) : line));
  };
  lines.push("");
  append(page.usage, 2);
  lines.push("");
  append(page.description, 2);
  for (const section of sections) {
    if (!section.rows.length) continue;
    lines.push("", `  ${styled(`${section.title}:`, "38;5;245")}`);
    for (const [label, description] of section.rows) {
      if (stacked) {
        append(label, 4);
        append(description, 6);
        continue;
      }
      const wrapped = wrapHelpText(description, width - descriptionColumn);
      // Calculate padding on plain labels before adding ANSI color codes.
      lines.push(
        `    ${styled(label, "97")}${" ".repeat(labelWidth - label.length + 2)}${wrapped[0]}`,
      );
      for (const continuation of wrapped.slice(1))
        lines.push(" ".repeat(descriptionColumn) + continuation);
    }
  }
  if (page.notes?.length) {
    lines.push("", `  ${styled("Notes:", "38;5;245")}`);
    for (const note of page.notes) append(note, 4);
  }
  if (page.examples?.length) {
    lines.push("", `  ${styled("Examples:", "38;5;245")}`);
    for (const [index, example] of page.examples.entries()) {
      if (index) lines.push("");
      append(example.description, 4);
      for (const line of renderExample(example.args, width)) lines.push(styled(line, "38;5;151"));
    }
  }
  return lines.join("\n");
}

function wrapHelpText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = "";
    }
    // Preserve long option names and paths rather than breaking a CLI argument.
    line += `${line ? " " : ""}${word}`;
  }
  if (line) lines.push(line);
  return lines;
}

function renderExample(args: string[], width: number): string[] {
  const lines: string[] = [];
  let line = "    $";
  for (const argument of ["arca-siradig", ...args]) {
    if (line.length + argument.length + 1 > width - 2 && line.trim() !== "$") {
      lines.push(`${line} \\`);
      line = "     ";
    }
    line += ` ${argument}`;
  }
  lines.push(line);
  return lines;
}
