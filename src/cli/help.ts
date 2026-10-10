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

const PERSON_OPTION: HelpRow = [
  "--person <id|nombre>",
  "Usar otra persona en lugar de la selección guardada",
];
const FORMAT_OPTION: HelpRow = ["--format <text|json>", "Formato de salida (predeterminado: text)"];
const PERIOD_OPTION: HelpRow = [
  "--period <AAAA>",
  "Período fiscal; obligatorio para modificar el formulario",
];
const GLOBAL_OPTIONS: HelpRow[] = [
  ["-h, --help", "Mostrar la ayuda del comando"],
  ["--headless <true|false>", "Ejecutar sin mostrar el navegador (predeterminado: true)"],
];

const HELP_PAGES: Record<HelpCommand["topic"], HelpPage> = {
  root: {
    usage: "arca-siradig [opciones] <comando>",
    description: "Gestioná sesiones, personas y formularios fiscales de ARCA SiRADIG.",
    commands: [
      ["login", "Iniciar sesión en ARCA y guardarla"],
      ["logout", "Eliminar la sesión guardada"],
      ["persons <comando>", "Listar personas o seleccionar una"],
      ["personal-data <comando>", "Consultar datos personales"],
      ["employees <comando>", "Consultar datos de empleadores"],
      ["form <comando>", "Consultar, imprimir o enviar un formulario fiscal"],
      ["mcp", "Iniciar el servidor MCP local por stdio"],
    ],
    options: [["-i, --interactive", "Iniciar el modo interactivo de consulta"]],
    notes: ["Ejecutá arca-siradig <comando> --help para ver los detalles de un comando."],
    examples: [
      { description: "Iniciar sesión", args: ["login"] },
      {
        description: "Consultar el resumen de un formulario",
        args: ["form", "summary", "--period=2026"],
      },
    ],
  },
  mcp: {
    usage: "arca-siradig mcp [opciones]",
    description:
      "Iniciá un servidor MCP local para clientes de IA compatibles, usando la sesión del CLI.",
    options: [
      [
        "--allow-writes",
        "Habilitar cambios en borradores; el envío al empleador se hace desde el CLI",
      ],
    ],
    notes: [
      "Iniciá sesión con arca-siradig login desde la terminal. Nunca compartas tu clave fiscal con el cliente de IA.",
      "stdout se reserva para mensajes MCP. Configurá el cliente para ejecutar este comando por stdio.",
      "Las consultas están habilitadas de forma predeterminada. Para modificar un borrador, indicá la persona y el período fiscal.",
    ],
    examples: [
      { description: "Iniciar el servidor para consultas", args: ["mcp"] },
      { description: "Habilitar cambios en borradores", args: ["mcp", "--allow-writes"] },
    ],
  },
  login: {
    usage: "arca-siradig login [opciones]",
    description: "Iniciá sesión en ARCA y guardala. El CLI te pide las credenciales que falten.",
    options: [
      ["--cuit <cuit>", "CUIT/CUIL de ARCA"],
      ["--password <clave>", "Clave fiscal de ARCA"],
    ],
    notes: [
      "Ingresá la clave fiscal cuando el CLI te la pida. Si usás --password, puede quedar en el historial de la terminal y en los argumentos del proceso.",
    ],
    examples: [
      { description: "Ingresar las credenciales desde la terminal", args: ["login"] },
      {
        description: "Iniciar sesión con el navegador visible",
        args: ["login", "--headless=false"],
      },
    ],
  },
  logout: {
    usage: "arca-siradig logout",
    description: "Eliminá la sesión guardada en ~/.arca-siradig/session.json.",
    examples: [{ description: "Eliminar la sesión local", args: ["logout"] }],
  },
  persons: {
    usage: "arca-siradig persons <comando> [opciones]",
    description: "Gestioná las personas disponibles y la selección guardada.",
    commands: [
      ["list", "Listar las personas disponibles"],
      ["select <id|nombre>", "Seleccionar una persona por el ID o nombre de la lista"],
    ],
    options: [["--format <text|json>", "Formato de salida de list (predeterminado: text)"]],
    notes: [
      "El ID de selección puede ser un índice interno, como 0. Usá el que aparece en la lista; no asumas que es un CUIT.",
    ],
    examples: [
      { description: "Listar personas", args: ["persons", "list"] },
      { description: "Seleccionar una persona por ID", args: ["persons", "select", "0"] },
    ],
  },
  "personal-data": {
    usage: "arca-siradig personal-data <comando> [opciones]",
    description: "Consultá los datos personales de la persona seleccionada.",
    commands: [["show [persona]", "Mostrar las secciones de datos personales de SiRADIG"]],
    options: [PERSON_OPTION, FORMAT_OPTION],
    examples: [{ description: "Consultar datos personales", args: ["personal-data", "show"] }],
  },
  employees: {
    usage: "arca-siradig employees <comando> [opciones]",
    description: "Consultá los empleadores de la persona seleccionada.",
    commands: [
      ["list [persona]", "Listar empleadores"],
      ["show --employee-cuit <cuit>", "Consultar un empleador por CUIT"],
    ],
    options: [
      PERSON_OPTION,
      ["--employee-cuit <cuit>", "CUIT del empleador; obligatorio para show"],
      FORMAT_OPTION,
    ],
    examples: [
      { description: "Listar empleadores", args: ["employees", "list"] },
      {
        description: "Consultar un empleador",
        args: ["employees", "show", "--employee-cuit=30000000001"],
      },
    ],
  },
  form: {
    usage: "arca-siradig form <comando> [opciones]",
    description: "Consultá, imprimí o enviá el borrador fiscal de la persona seleccionada.",
    commands: [
      ["show", "Mostrar la persona representada y el período fiscal"],
      ["summary", "Consultar la vista previa oficial del borrador"],
      ["print --path <archivo|carpeta>", "Descargar el PDF oficial del borrador"],
      ["submit --period <AAAA>", "Enviar el formulario; pide aceptar o cancelar"],
      ["deductions <comando>", "Listar, consultar, agregar o eliminar deducciones"],
    ],
    options: [
      PERSON_OPTION,
      PERIOD_OPTION,
      ["--path <archivo|carpeta>", "Destino del PDF; obligatorio para print"],
      ["--aceptar", "Aceptar Generar Presentación sin preguntar; solo para submit"],
      [
        "--format <text|json>",
        "Formato de salida de show, summary y submit (predeterminado: text)",
      ],
    ],
    notes: [
      "Podés omitir --period en las consultas; informan el período seleccionado por ARCA.",
      "Si indicás una carpeta, se usa f572-<año>-borrador.pdf. Si el archivo existe, se agrega (1), (2), etc.",
      "El envío requiere --period. Si no hay una terminal interactiva, también requiere --aceptar.",
      "Ejecutá arca-siradig form deductions --help para ver los comandos de deducciones.",
    ],
    examples: [
      {
        description: "Consultar el resumen del borrador",
        args: ["form", "summary", "--period=2026"],
      },
      {
        description: "Guardar el PDF del borrador en la carpeta actual",
        args: ["form", "print", "--period=2026", "--path=./"],
      },
      {
        description: "Revisar y confirmar el envío desde la terminal",
        args: ["form", "submit", "--period=2026"],
      },
    ],
  },
  deductions: {
    usage: "arca-siradig form deductions <comando> [opciones]",
    description: "Consultá las deducciones o modificá el borrador fiscal seleccionado.",
    commands: [
      ["list", "Listar las deducciones de la persona seleccionada"],
      ["list-receipt-types", "Listar el catálogo de tipos de comprobante"],
      ["show <id>", "Consultar una deducción por ID"],
      ["add-item", "Agregar un detalle mensual a una deducción"],
      ["add-item-receipt", "Agregar un comprobante a una deducción"],
      ["remove-item-receipt", "Eliminar un comprobante de gastos médicos"],
    ],
    options: [
      PERIOD_OPTION,
      PERSON_OPTION,
      ["--type <tipo>", "Tipo de deducción; obligatorio para add-item y add-item-receipt"],
      ["--cuit <cuit>", "CUIT del prestador; obligatorio para modificar el borrador"],
      ["--month <1-12>", "Número de mes; obligatorio para add-item y add-item-receipt"],
      ["--amount <importe>", "Importe; obligatorio para add-item y add-item-receipt"],
      ["--date <AAAA-MM-DD>", "Fecha del comprobante; obligatoria para add-item-receipt"],
      ["--receipt-type <id>", "ID del tipo de comprobante; obligatorio para add-item-receipt"],
      ["--number <valor>", "Número de comprobante; obligatorio para agregarlo o eliminarlo"],
      [
        "--reimbursed-amount <importe>",
        "Obligatorio para comprobantes de gastos médicos (gastos-medicos)",
      ],
      [
        "--format <text|json>",
        "Formato de salida de list, show y tipos de comprobante (predeterminado: text)",
      ],
    ],
    notes: [
      "Para modificar el borrador, indicá --period. Las fechas de los comprobantes deben corresponder a ese período fiscal.",
      "El catálogo de tipos de comprobante no admite --period.",
      "remove-item-receipt admite gastos-medicos; es el valor predeterminado de --type.",
    ],
    examples: [
      { description: "Listar deducciones", args: ["form", "deductions", "list", "--period=2026"] },
      {
        description: "Listar tipos de comprobante",
        args: ["form", "deductions", "list-receipt-types"],
      },
      { description: "Consultar una deducción", args: ["form", "deductions", "show", "123"] },
      {
        description: "Agregar un detalle mensual",
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
        description: "Agregar un comprobante a una deducción mensual",
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
        description: "Agregar un comprobante de gastos médicos",
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
        description: "Eliminar un comprobante de gastos médicos",
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
    { title: "Comandos", rows: page.commands ?? [] },
    { title: "Opciones", rows: page.options ?? [] },
    { title: "Opciones generales", rows: globals },
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
    lines.push("", `  ${styled("Notas:", "38;5;245")}`);
    for (const note of page.notes) append(note, 4);
  }
  if (page.examples?.length) {
    lines.push("", `  ${styled("Ejemplos:", "38;5;245")}`);
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
