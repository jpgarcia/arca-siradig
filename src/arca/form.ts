import type { Page } from "playwright";
import { resolvePdfDestination, savePdfWithUniqueName } from "../files/pdf.js";
import { acceptReminderModalIfPresent, selectPerson } from "./persons.js";
import { assertWorkerSiradigUrl, SIRADIG_BASE_URL } from "./session.js";

export type FormContext = {
  period: number;
  person: { id: string; name: string };
};

export type FormSummary = FormContext & {
  source: "draft-preview";
  submissionType: string | null;
  withholdingAgent: { id: string; name: string } | null;
  totals: Array<{ label: string; amount: string }>;
  sections: Array<{ title: string; tables: string[][][]; hasData: boolean }>;
};

export async function readFormContext(page: Page): Promise<FormContext> {
  assertWorkerSiradigUrl(page.url());
  const breadcrumb = await page.locator("#breadCrumb0").innerText();
  const period = breadcrumb.match(/Per[ií]odo\s+(\d{4})/i)?.[1];
  const person = await page.locator("#encabezado_usuario").evaluate((table) => {
    const row = Array.from(table.querySelectorAll("tr")).find((row) =>
      /Representando\s+a\s*:/i.test(row.cells[0]?.textContent ?? ""),
    );
    return row?.cells[1]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  });
  const match = person.match(/^(\d{11})\s*-\s*(.+)$/);
  if (!period || !match) {
    throw new Error(
      `No se pudo confirmar la persona y el período del formulario en ARCA.\n` +
        `Encabezado: ${person || "no disponible"}. Período: ${period || "no disponible"}.\n` +
        "Revisá la pantalla con --headless false y la selección con `arca-siradig persons list`.",
    );
  }
  return { period: Number(period), person: { id: match[1], name: match[2] } };
}

export async function verifyFormContext(
  page: Page,
  expected: { period?: number; person: string },
): Promise<FormContext> {
  const context = await readFormContext(page);
  if (expected.period !== undefined && context.period !== expected.period) {
    throw new Error(`ARCA abrió el período ${context.period}; se solicitó ${expected.period}.`);
  }
  if (
    context.person.id !== expected.person &&
    normalizePersonName(context.person.name) !== normalizePersonName(expected.person)
  ) {
    throw new Error(
      "ARCA abrió el formulario de una persona diferente de la solicitada.\n" +
        `Persona esperada (CUIT o nombre): ${expected.person}.\n` +
        `Persona en ARCA: CUIT ${context.person.id} - ${context.person.name}. Período: ${context.period}.\n` +
        "Revisá `arca-siradig persons list` y elegí la persona con `--person <id|nombre>` o `arca-siradig persons select <id|nombre>`.\n" +
        "El ID de selección de ARCA puede ser un índice interno; no necesariamente es el CUIT.",
    );
  }
  return context;
}

export async function openFormPeriod(page: Page, period: number): Promise<void> {
  const url = new URL("jsp/determinarContribuyente.do", SIRADIG_BASE_URL);
  url.searchParams.set("codigo", String(period));
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  const error = await page
    .getByText("El período seleccionado es inválido o inexistente", {
      exact: true,
    })
    .isVisible();
  if (error) throw new Error(`ARCA no permite acceder al período ${period}.`);
}

export async function selectFormPeriod(
  page: Page,
  expected: { period?: number; person: string; selector?: string },
): Promise<FormContext> {
  const current = await verifyFormContext(page, { person: expected.person });
  if (expected.period !== undefined && current.period !== expected.period) {
    await openFormPeriod(page, expected.period);
    if (await page.locator('input[type="button"].btn_empresa').count()) {
      await selectPerson(page, expected.selector ?? current.person.name);
    }
    await acceptReminderModalIfPresent(page);
  }
  return verifyFormContext(page, { period: expected.period, person: current.person.id });
}

function normalizePersonName(name: string): string {
  return name.replace(/,/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

export async function openFormPreview(page: Page): Promise<void> {
  await page.goto(new URL("jsp/vistaPreviaFormulario.do", SIRADIG_BASE_URL).href, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#tabla_datos_personales").waitFor({ state: "attached", timeout: 15_000 });
}

export async function readFormSummary(page: Page): Promise<FormSummary> {
  const context = await readFormContext(page);
  const preview = await page.locator("#contenido").evaluate((content) => {
    const totals: Array<{ label: string; amount: string }> = [];
    for (const table of Array.from(
      content.querySelectorAll<HTMLTableElement>("table.tabla_vista_previa"),
    )) {
      const cells = Array.from(table.rows[0]?.cells ?? []).map(
        (cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "",
      );
      if (cells.length === 3 && /Importe Total/i.test(cells[1])) {
        totals.push({ label: cells[0], amount: cells[2] });
      }
    }
    const sections = Array.from(content.querySelectorAll("h3")).map((heading) => {
      const tables: string[][][] = [];
      let hasData = false;
      let row = heading.closest("tr")?.nextElementSibling;
      while (row && !row.querySelector("h3")) {
        for (const table of Array.from(
          row.querySelectorAll<HTMLTableElement>("table.tabla_vista_previa"),
        )) {
          const rows = Array.from(table.rows)
            .filter((item) => item.closest("table") === table)
            .filter((item) => !Array.from(item.cells).some((cell) => cell.querySelector("table")))
            .map((item) => {
              if (
                Array.from(item.cells).some(
                  (cell) => cell.tagName === "TD" && cell.textContent?.trim(),
                ) ||
                /Subtotal\s*:/i.test(item.textContent ?? "")
              )
                hasData = true;
              return Array.from(item.cells).map(
                (cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "",
              );
            });
          if (rows.length) tables.push(rows);
        }
        row = row.nextElementSibling;
      }
      return { title: heading.textContent?.replace(/\s+/g, " ").trim() ?? "", tables, hasData };
    });
    const ownCells = Array.from(content.querySelectorAll("td")).filter(
      (cell) => !cell.querySelector("table"),
    );
    const submissionType =
      ownCells
        .map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .find((text) => /Car[aá]cter de la presentaci[oó]n\s*:/i.test(text))
        ?.split(":")
        .slice(1)
        .join(":")
        .trim() ?? null;
    const agentText = Array.from(content.querySelectorAll("th, td, div"))
      .filter((element) => !element.querySelector("table"))
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .find((text) => /^Agente de retenci[oó]n:/i.test(text));
    const agent = agentText?.match(/^Agente de retenci[oó]n:\s*CUIT\s*(\d{11})\s*-\s*(.+)$/i);
    const withholdingAgent = agent
      ? { id: agent[1], name: agent[2].replace(/\s+/g, " ").trim() }
      : null;
    return { totals, sections, submissionType, withholdingAgent };
  });
  if (!preview.sections.length || !preview.totals.length) {
    throw new Error(
      "La vista previa de ARCA no tiene el formato esperado; no se pudo leer el resumen.",
    );
  }
  return { ...context, source: "draft-preview", ...preview };
}

export async function printFormDraft(page: Page, path: string, period?: number): Promise<string> {
  const fiscalYear = period ?? (await readFormContext(page)).period;
  const destination = await resolvePdfDestination(path, `f572-${fiscalYear}-borrador.pdf`);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.locator("#btn_imprimir_borrador").click(),
  ]);
  try {
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    if (body.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("ARCA no devolvió el PDF del borrador. No se guardó ningún archivo.");
    }
    return await savePdfWithUniqueName(body, destination);
  } finally {
    await download.delete();
  }
}
