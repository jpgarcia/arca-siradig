import type { FormSummary } from "../arca/form.js";
import type {
  DataGroup,
  DeductionDetailView,
  DeductionSummary,
  EmployeeSummary,
  PersonalDataGroup,
  ReceiptType,
} from "../types.js";

export function printFormSummary(summary: FormSummary): void {
  console.log(
    renderFormSummary(summary, {
      color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
      width: process.stdout.columns,
    }),
  );
}

export function renderFormSummary(
  summary: FormSummary,
  options: { color?: boolean; width?: number } = {},
): string {
  const width = Math.max(36, Math.min(options.width ?? 90, 110));
  const lines: string[] = [];
  const styled = (text: string, code: string) =>
    options.color ? `\u001b[${code}m${text}\u001b[0m` : text;
  const append = (text: string, indent = 0, style?: string) => {
    for (const line of wrapText(text, width - indent)) {
      lines.push(`${" ".repeat(indent)}${style ? styled(line, style) : line}`);
    }
  };
  const amountRow = (label: string, amount: string, indent = 0, style?: string) => {
    const money = `$ ${amount}`;
    const labelWidth = Math.max(10, width - indent - money.length - 2);
    const wrapped = wrapText(label, labelWidth);
    for (const line of wrapped.slice(0, -1)) append(line, indent, style);
    const last = wrapped.at(-1) ?? "";
    lines.push(
      `${" ".repeat(indent)}${style ? styled(last.padEnd(labelWidth), style) : last.padEnd(labelWidth)}  ${styled(money, style ?? "38;5;151")}`,
    );
  };

  lines.push("");
  append(`F572 WEB · ${summary.period}`, 0, "1");
  append(
    `Vista previa · Borrador${summary.submissionType ? ` · ${summary.submissionType}` : ""}`,
    0,
    "90",
  );
  lines.push("─".repeat(width));
  append(summary.person.name, 0, "1");
  append(`CUIT ${summary.person.id}`, 0, "90");
  if (summary.withholdingAgent) {
    lines.push("");
    append("Agente de retención", 0, "90");
    append(summary.withholdingAgent.name);
    append(`CUIT ${summary.withholdingAgent.id}`, 0, "90");
  }
  lines.push("");
  append("TOTALES INFORMADOS POR ARCA", 0, "1");
  for (const total of summary.totals) amountRow(total.label, total.amount);

  const emptySections: string[] = [];
  for (const section of summary.sections) {
    const title = shortFormSectionTitle(section.title);
    if (!section.hasData) {
      emptySections.push(title);
      continue;
    }
    lines.push("");
    append(title.toUpperCase(), 0, "1");
    lines.push(styled("─".repeat(width), "90"));
    for (const table of section.tables) {
      const isMoneyTable = table.some((row) =>
        /Subtotal\s*:|Importe Total\s*:|\$/i.test(row[1] ?? ""),
      );
      if (!isMoneyTable) {
        const headers = table[0] ?? [];
        for (const row of table.slice(1)) {
          for (const [index, value] of row.entries()) {
            if (value) append(headers[index] ? `${headers[index]}: ${value}` : value, 2);
          }
          lines.push("");
        }
        continue;
      }
      for (const row of table) {
        if (/Importe Total\s*:/i.test(row[1] ?? "")) continue;
        if (/Subtotal\s*:/i.test(row[1] ?? "")) {
          const provider = row[0].match(/^(\d{11})\s*-\s*(.+)$/);
          lines.push("");
          if (provider) {
            append(provider[2], 2);
            amountRow(`Subtotal · CUIT ${provider[1]}`, row[2], 2, "90");
          } else {
            amountRow(row[0], row[2], 0, "1");
          }
        } else if (row[1]?.includes("$") && row.length >= 3) {
          const label =
            row.length >= 5 ? `${row[0]} (${row[1].replace(/x/i, "×")} ${row[2]})` : row[0];
          amountRow(label, row.at(-1) ?? "", 4);
        } else {
          append(row.filter(Boolean).join(" · "), 2);
        }
      }
    }
  }
  if (emptySections.length) {
    lines.push("");
    append("Sin datos informados", 0, "90");
    append(emptySections.join(" · "), 2, "90");
  }
  return lines.join("\n");
}

function shortFormSectionTitle(title: string): string {
  if (/^1\s*-/.test(title)) return "Cargas de familia";
  if (/^2\s*-/.test(title)) return "Otros empleadores";
  if (/^3\s*-/.test(title)) return "Deducciones y desgravaciones";
  if (/^4\s*-/.test(title)) return "Retenciones, percepciones y pagos a cuenta";
  if (/^5\s*-/.test(title)) return "Beneficios";
  return title;
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = "";
    }
    if (word.length > width) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length - width; index += width)
        lines.push(word.slice(index, index + width));
      line = word.slice(Math.floor((word.length - 1) / width) * width);
    } else {
      line += `${line ? " " : ""}${word}`;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

export function printPersonalData(groups: PersonalDataGroup[]): void {
  printDataGroups("Datos Personales", groups, "No se encontraron datos personales para mostrar.");
}

export function printEmployees(employees: EmployeeSummary[]): void {
  console.log("\nEmpleadores");

  if (employees.length === 0) {
    console.log("No se encontraron empleadores para mostrar.");
    return;
  }

  employees.forEach((employee, index) => {
    if (index > 0) {
      console.log("");
    }

    console.log(`CUIT: ${employee.cuit}`);
    console.log(`Razón Social / Apellido y Nombre: ${employee.name}`);
    console.log(`Fecha Inicio: ${employee.startDate ?? ""}`);
    console.log(`Fecha Fin: ${employee.endDate ?? ""}`);
    console.log(`Agente de Retención: ${employee.withholdingAgent ?? ""}`);
  });
}

export function printEmployeeData(groups: DataGroup[]): void {
  printDataGroups("Empleador", groups, "No se encontraron datos del empleador para mostrar.", {
    skipFirstGroupTitleIfMatchesHeading: true,
  });
}

export function printDeductions(deductions: DeductionSummary[]): void {
  console.log("\nDeducciones y desgravaciones");

  if (deductions.length === 0) {
    console.log("No se encontraron deducciones para mostrar.");
    return;
  }

  deductions.forEach((deduction, index) => {
    if (index > 0) {
      console.log("");
    }

    console.log(`Type: ${deduction.type}`);
    console.log(`ID: ${deduction.id}`);
    console.log(`CUIT: ${deduction.cuit}`);
    console.log(`Denominación: ${deduction.name}`);
    console.log(`Período: ${deduction.period}`);
    console.log(`Importe: ${deduction.amount}`);
  });
}

export function printReceiptTypes(receiptTypes: ReceiptType[]): void {
  console.log("ID      Tipo");

  for (const receiptType of receiptTypes) {
    console.log(`${receiptType.id.padEnd(7)} ${receiptType.name}`);
  }
}

export function printDeductionDetail(detail: DeductionDetailView): void {
  console.log(`\n${detail.heading}`);
  console.log(`CUIT: ${detail.cuit}`);
  console.log(`Razón Social: ${detail.name}`);
  console.log("");
  if (isSinglePeriodDeduction(detail)) {
    printSectionTitle("Período y Monto");
    console.log(`Período: ${detail.fromMonthLabel}`);
    console.log(`Monto Deducible: ${detail.amount}`);
  } else {
    printSectionTitle("Período");
    console.log(`Mes Desde: ${detail.fromMonthLabel}`);
    console.log(`Mes Hasta: ${detail.toMonthLabel}`);
    console.log("");
    printSectionTitle("Monto");
    console.log(`Monto Total: ${detail.amount}`);
  }

  if (detail.monthlyDetail.length > 0) {
    console.log("");
    printSectionTitle("Detalle Mensual");

    for (const monthlyDetail of detail.monthlyDetail) {
      console.log(`Mes: ${formatMonthName(monthlyDetail.month)}`);
      console.log(`Monto Mensual: ${monthlyDetail.monthlyAmount}`);
      console.log(`Monto Comprobantes Ingresados: ${monthlyDetail.receiptsTotalAmount}`);
      console.log("");
    }
  }

  if (detail.receipts.length > 0) {
    if (detail.monthlyDetail.length === 0) {
      console.log("");
    }
    printSectionTitle("Comprobantes");

    for (const receipt of detail.receipts) {
      console.log(`Mes: ${formatMonthName(receipt.month)}`);
      console.log(`Fecha: ${receipt.date}`);
      console.log(`Tipo: ${receipt.type}`);
      console.log(`ID: ${receipt.id}`);
      console.log(`Monto: ${receipt.amount}`);
      console.log("");
    }
  }
}

function printSectionTitle(title: string): void {
  console.log(title);
  console.log("-".repeat(title.length));
}

function isSinglePeriodDeduction(detail: DeductionDetailView): boolean {
  return detail.monthlyDetail.length === 0 && detail.fromMonth > 0 && detail.toMonth === 0;
}

function printDataGroups(
  title: string,
  groups: DataGroup[],
  emptyMessage: string,
  options: { skipFirstGroupTitleIfMatchesHeading?: boolean } = {},
): void {
  console.log(`\n${title}`);

  if (groups.length === 0) {
    console.log(emptyMessage);
    return;
  }

  groups.forEach((group, index) => {
    const shouldSkipGroupTitle =
      options.skipFirstGroupTitleIfMatchesHeading && index === 0 && group.title === title;

    if (!shouldSkipGroupTitle) {
      console.log(`\n${group.title}`);
    }

    for (const field of group.fields) {
      console.log(`- ${field.label}: ${field.value}`);
    }
  });
}

function formatMonthName(month: number): string {
  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  return monthNames[month - 1] ?? String(month);
}
