export type OutputFormat = "text" | "json";

export type HelpCommand = {
  kind: "help";
  headless: boolean;
  topic:
    | "root"
    | "login"
    | "logout"
    | "persons"
    | "personal-data"
    | "employees"
    | "deductions"
    | "form"
    | "mcp";
};

export type McpCommand = { kind: "mcp"; headless: boolean; allowWrites: boolean };

export type InteractiveCommand = {
  kind: "interactive";
  headless: boolean;
};

export type LogoutCommand = {
  kind: "logout";
};

export type LoginCommand = {
  kind: "login";
  headless: boolean;
  cuit?: string;
  password?: string;
  hasExplicitCredentials: boolean;
};

export type PersonsListCommand = {
  kind: "persons-list";
  headless: boolean;
  format: OutputFormat;
};

export type PersonsSelectCommand = {
  kind: "persons-select";
  headless: boolean;
  person: string;
};

export type PersonsPersonalDataShowCommand = {
  kind: "persons-personal-data-show";
  headless: boolean;
  person?: string;
  format: OutputFormat;
};

export type PersonsEmployeesListCommand = {
  kind: "persons-employees-list";
  headless: boolean;
  person?: string;
  format: OutputFormat;
};

export type PersonsEmployeesShowCommand = {
  kind: "persons-employees-show";
  headless: boolean;
  person?: string;
  employeeCuit: string;
  format: OutputFormat;
};

export type FormDeductionsListCommand = {
  period?: number;
  kind: "form-deductions-list";
  headless: boolean;
  person?: string;
  format: OutputFormat;
};

export type FormDeductionsListReceiptTypesCommand = {
  kind: "form-deductions-list-receipt-types";
  headless: boolean;
  format: OutputFormat;
};

export type FormDeductionsShowCommand = {
  period?: number;
  kind: "form-deductions-show";
  headless: boolean;
  person?: string;
  deductionId: string;
  format: OutputFormat;
};

export type FormDeductionsAddItemCommand = {
  period: number;
  person?: string;
  kind: "form-deductions-add-item";
  headless: boolean;
  deductionType: string;
  cuit: string;
  month: number;
  amount: string;
};

export type FormDeductionsAddItemReceiptCommand = {
  period: number;
  person?: string;
  kind: "form-deductions-add-item-receipt";
  headless: boolean;
  deductionType: string;
  cuit: string;
  month: number;
  date: string;
  receiptType: string;
  number: string;
  amount: string;
  reimbursedAmount?: string;
};

export type FormDeductionsRemoveItemReceiptCommand = {
  period: number;
  person?: string;
  kind: "form-deductions-remove-item-receipt";
  headless: boolean;
  deductionType: string;
  cuit: string;
  number: string;
};

export type FormPreviewCommand = {
  kind: "form-summary" | "form-show" | "form-print";
  headless: boolean;
  person?: string;
  period?: number;
  format: OutputFormat;
  path?: string;
};

export type FormSubmitCommand = {
  kind: "form-submit";
  headless: boolean;
  person?: string;
  period: number;
  accept: boolean;
  format: OutputFormat;
};

export type CliCommand =
  | McpCommand
  | FormSubmitCommand
  | FormPreviewCommand
  | HelpCommand
  | InteractiveCommand
  | LogoutCommand
  | LoginCommand
  | PersonsListCommand
  | PersonsSelectCommand
  | PersonsPersonalDataShowCommand
  | PersonsEmployeesListCommand
  | PersonsEmployeesShowCommand
  | FormDeductionsListCommand
  | FormDeductionsListReceiptTypesCommand
  | FormDeductionsShowCommand
  | FormDeductionsAddItemCommand
  | FormDeductionsAddItemReceiptCommand
  | FormDeductionsRemoveItemReceiptCommand;

export function parseCliOptions(args: string[]): CliCommand {
  let allowWrites = false;
  let accept = false;
  let headless = true;
  let interactive = false;
  let help = false;
  let cuit: string | undefined;
  let password: string | undefined;
  let person: string | undefined;
  let employeeCuit: string | undefined;
  let deductionType: string | undefined;
  let month: string | undefined;
  let date: string | undefined;
  let receiptType: string | undefined;
  let number: string | undefined;
  let amount: string | undefined;
  let reimbursedAmount: string | undefined;
  let period: number | undefined;
  let path: string | undefined;
  let format: OutputFormat = "text";
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--interactive" || arg === "-i") {
      interactive = true;
      continue;
    }

    if (arg === "--headless") {
      headless = parseBooleanFlagValue(readFlagValue(args, index, "--headless"), "--headless");
      index += 1;
      continue;
    }

    if (arg.startsWith("--headless=")) {
      headless = parseBooleanFlagValue(arg.slice("--headless=".length), "--headless");
      continue;
    }

    if (arg === "--cuit") {
      cuit = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--cuit=")) {
      cuit = arg.slice("--cuit=".length);
      continue;
    }

    if (arg === "--password") {
      password = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
      continue;
    }

    if (arg === "--person") {
      person = readFlagValue(args, index, "--person");
      index += 1;
      continue;
    }

    if (arg.startsWith("--person=")) {
      person = arg.slice("--person=".length);
      continue;
    }

    if (arg === "--employee-cuit") {
      employeeCuit = readFlagValue(args, index, "--employee-cuit");
      index += 1;
      continue;
    }

    if (arg.startsWith("--employee-cuit=")) {
      employeeCuit = arg.slice("--employee-cuit=".length);
      continue;
    }

    if (arg === "--type") {
      deductionType = readFlagValue(args, index, "--type");
      index += 1;
      continue;
    }

    if (arg.startsWith("--type=")) {
      deductionType = arg.slice("--type=".length);
      continue;
    }

    if (arg === "--month") {
      month = readFlagValue(args, index, "--month");
      index += 1;
      continue;
    }

    if (arg.startsWith("--month=")) {
      month = arg.slice("--month=".length);
      continue;
    }

    if (arg === "--date") {
      date = readFlagValue(args, index, "--date");
      index += 1;
      continue;
    }

    if (arg.startsWith("--date=")) {
      date = arg.slice("--date=".length);
      continue;
    }

    if (arg === "--receipt-type") {
      receiptType = readFlagValue(args, index, "--receipt-type");
      index += 1;
      continue;
    }

    if (arg.startsWith("--receipt-type=")) {
      receiptType = arg.slice("--receipt-type=".length);
      continue;
    }

    if (arg === "--number") {
      number = readFlagValue(args, index, "--number");
      index += 1;
      continue;
    }

    if (arg.startsWith("--number=")) {
      number = arg.slice("--number=".length);
      continue;
    }

    if (arg === "--amount") {
      amount = readFlagValue(args, index, "--amount");
      index += 1;
      continue;
    }

    if (arg.startsWith("--amount=")) {
      amount = arg.slice("--amount=".length);
      continue;
    }

    if (arg === "--reimbursed-amount") {
      reimbursedAmount = readFlagValue(args, index, "--reimbursed-amount");
      index += 1;
      continue;
    }

    if (arg.startsWith("--reimbursed-amount=")) {
      reimbursedAmount = arg.slice("--reimbursed-amount=".length);
      continue;
    }

    if (arg === "--period" || arg.startsWith("--period=")) {
      const value = arg === "--period" ? readFlagValue(args, index++, "--period") : arg.slice(9);
      if (!/^[12]\d{3}$/.test(value))
        throw new Error("--period requiere un período fiscal de cuatro dígitos.");
      period = Number(value);
      continue;
    }
    if (arg === "--path" || arg.startsWith("--path=")) {
      path = arg === "--path" ? readFlagValue(args, index++, "--path") : arg.slice(7);
      continue;
    }

    if (arg === "--aceptar") {
      accept = true;
      continue;
    }

    if (arg === "--allow-writes") {
      allowWrites = true;
      continue;
    }

    if (arg === "--format") {
      format = parseOutputFormat(readFlagValue(args, index, "--format"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      format = parseOutputFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Opción desconocida: ${arg.split("=", 1)[0]}`);
    }

    positionals.push(arg);
  }

  if (positionals[0] === "deductions") {
    throw new Error("Comando desconocido: deductions. Usá arca-siradig form deductions <comando>.");
  }
  if (help || args.length === 0) {
    return { kind: "help", headless, topic: inferHelpTopic(positionals) };
  }
  if (allowWrites && positionals[0] !== "mcp") {
    throw new Error("--allow-writes solo se admite con mcp.");
  }
  if (positionals[0] === "mcp") {
    if (positionals.length !== 1 || interactive)
      throw new Error("Usá arca-siradig mcp [opciones].");
    for (const arg of args) {
      if (arg.startsWith("-") && !["--headless", "--allow-writes"].includes(arg.split("=", 1)[0])) {
        throw new Error(`Opción no admitida para mcp: ${arg.split("=", 1)[0]}`);
      }
    }
    return { kind: "mcp", headless, allowWrites };
  }
  if (accept && !(positionals[0] === "form" && positionals[1] === "submit")) {
    throw new Error("--aceptar solo se admite con form submit.");
  }
  if (period !== undefined && positionals[0] !== "form") {
    throw new Error("--period solo se admite con los comandos de form.");
  }
  if (path !== undefined && !(positionals[0] === "form" && positionals[1] === "print")) {
    throw new Error("--path solo se admite con form print.");
  }
  if (positionals[0] === "form" && positionals[1] === "submit" && positionals.length === 2) {
    return { kind: "form-submit", headless, person, period: requirePeriod(period), accept, format };
  }
  if (
    positionals[0] === "form" &&
    positionals.length === 2 &&
    ["show", "summary", "print"].includes(positionals[1])
  ) {
    return {
      kind:
        positionals[1] === "show"
          ? "form-show"
          : positionals[1] === "summary"
            ? "form-summary"
            : "form-print",
      headless,
      person,
      period,
      format,
      ...(positionals[1] === "print" ? { path: readRequiredFlag(path, "--path") } : {}),
    };
  }
  const formContext = period === undefined ? {} : { period };
  const deductionPositionals =
    positionals[0] === "form" && positionals[1] === "deductions" ? positionals.slice(2) : [];

  if (interactive) {
    return { kind: "interactive", headless };
  }

  if (positionals[0] === "login" && positionals.length === 1) {
    return {
      kind: "login",
      headless,
      cuit,
      password,
      hasExplicitCredentials: Boolean(cuit || password),
    };
  }

  if (positionals[0] === "logout" && positionals.length === 1) {
    return { kind: "logout" };
  }

  if (positionals[0] === "persons" && positionals[1] === "list" && positionals.length === 2) {
    return { kind: "persons-list", headless, format };
  }

  if (positionals[0] === "persons" && positionals[1] === "select" && positionals.length === 3) {
    return {
      kind: "persons-select",
      headless,
      person: positionals[2],
    };
  }

  if (
    positionals[0] === "personal-data" &&
    positionals[1] === "show" &&
    (positionals.length === 2 || positionals.length === 3)
  ) {
    return {
      kind: "persons-personal-data-show",
      headless,
      person: person ?? positionals[2],
      format,
    };
  }

  if (
    positionals[0] === "employees" &&
    positionals[1] === "list" &&
    (positionals.length === 2 || positionals.length === 3)
  ) {
    return {
      kind: "persons-employees-list",
      headless,
      person: person ?? positionals[2],
      format,
    };
  }

  if (
    positionals[0] === "employees" &&
    positionals[1] === "show" &&
    (positionals.length === 2 || positionals.length === 3)
  ) {
    return {
      kind: "persons-employees-show",
      headless,
      person: person ?? positionals[2],
      employeeCuit: readRequiredFlag(employeeCuit, "--employee-cuit"),
      format,
    };
  }

  if (deductionPositionals[0] === "list-receipt-types" && deductionPositionals.length === 1) {
    if (period !== undefined)
      throw new Error("El catálogo de tipos de comprobante no tiene período fiscal.");
    return {
      kind: "form-deductions-list-receipt-types",
      headless,
      format,
    };
  }

  if (deductionPositionals[0] === "list" && deductionPositionals.length === 1) {
    return {
      kind: "form-deductions-list",
      ...formContext,
      headless,
      person,
      format,
    };
  }

  if (deductionPositionals[0] === "show" && deductionPositionals.length === 2) {
    return {
      kind: "form-deductions-show",
      ...formContext,
      headless,
      deductionId: readRequiredPositional(deductionPositionals[1], "El ID de la deducción"),
      person,
      format,
    };
  }

  if (deductionPositionals[0] === "add-item" && deductionPositionals.length === 1) {
    return {
      kind: "form-deductions-add-item",
      period: requirePeriod(period),
      ...(person === undefined ? {} : { person }),
      headless,
      deductionType: readRequiredFlag(deductionType, "--type"),
      cuit: readRequiredFlag(cuit, "--cuit"),
      month: parseRequiredMonth(month, "--month"),
      amount: readRequiredFlag(amount, "--amount"),
    };
  }

  if (deductionPositionals[0] === "add-item-receipt" && deductionPositionals.length === 1) {
    const normalizedDeductionType = readRequiredFlag(deductionType, "--type");
    const isMedicalExpenses = normalizedDeductionType === "gastos-medicos";
    if (date && period !== undefined && Number(date.slice(0, 4)) !== period) {
      throw new Error("--date debe corresponder al período fiscal indicado en --period.");
    }
    return {
      kind: "form-deductions-add-item-receipt",
      period: requirePeriod(period),
      ...(person === undefined ? {} : { person }),
      headless,
      deductionType: normalizedDeductionType,
      cuit: readRequiredFlag(cuit, "--cuit"),
      month: parseRequiredMonth(month, "--month"),
      date: readRequiredFlag(date, "--date"),
      receiptType: readRequiredFlag(receiptType, "--receipt-type"),
      number: readRequiredFlag(number, "--number"),
      amount: readRequiredFlag(amount, "--amount"),
      reimbursedAmount: isMedicalExpenses
        ? readRequiredFlag(reimbursedAmount, "--reimbursed-amount")
        : reimbursedAmount,
    };
  }

  if (deductionPositionals[0] === "remove-item-receipt" && deductionPositionals.length === 1) {
    return {
      kind: "form-deductions-remove-item-receipt",
      period: requirePeriod(period),
      ...(person === undefined ? {} : { person }),
      headless,
      deductionType: deductionType?.trim() || "gastos-medicos",
      cuit: readRequiredFlag(cuit, "--cuit"),
      number: readRequiredFlag(number, "--number"),
    };
  }

  if (positionals.length === 1) {
    const [command] = positionals;
    if (
      command === "login" ||
      command === "persons" ||
      command === "personal-data" ||
      command === "employees" ||
      command === "form" ||
      command === "logout"
    ) {
      return { kind: "help", headless, topic: command };
    }
  }

  if (positionals[0] === "form" && positionals[1] === "deductions" && positionals.length === 2) {
    return { kind: "help", headless, topic: "deductions" };
  }

  if (positionals[0] === "persons" && positionals[1] === "select" && positionals.length === 2) {
    return { kind: "help", headless, topic: "persons" };
  }

  throw new Error(`Comando desconocido: ${positionals[0] ?? "(sin comando)"}`);
}

function requirePeriod(period: number | undefined): number {
  if (period === undefined)
    throw new Error("--period es obligatorio para modificar un formulario.");
  return period;
}

function readFlagValue(args: string[], index: number, flagName: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flagName} requiere un valor.`);
  }

  return value;
}

function parseBooleanFlagValue(value: string | undefined, flagName: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${flagName} admite "true" o "false".`);
}

function parseOutputFormat(value: string): OutputFormat {
  if (value === "text" || value === "json") {
    return value;
  }

  throw new Error('--format admite "text" o "json".');
}

function readRequiredFlag(value: string | undefined, flagName: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${flagName} es obligatorio.`);
  }

  return value.trim();
}

function readRequiredPositional(value: string | undefined, label: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} es obligatorio.`);
  }

  return value.trim();
}

function parseRequiredMonth(value: string | undefined, flagName: string): number {
  const rawValue = readRequiredFlag(value, flagName);
  const month = Number.parseInt(rawValue, 10);
  if (!/^\d{1,2}$/.test(rawValue) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`${flagName} requiere un número entero del 1 al 12.`);
  }

  return month;
}

function inferHelpTopic(positionals: string[]): HelpCommand["topic"] {
  if (positionals[0] === "persons") {
    return "persons";
  }

  if (positionals[0] === "personal-data") {
    return "personal-data";
  }

  if (positionals[0] === "employees") {
    return "employees";
  }

  if (positionals[0] === "login") {
    return "login";
  }

  if (positionals[0] === "mcp") return "mcp";

  if (positionals[0] === "form") return positionals[1] === "deductions" ? "deductions" : "form";

  if (positionals[0] === "logout") {
    return "logout";
  }

  return "root";
}
