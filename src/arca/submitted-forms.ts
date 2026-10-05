import type { Page } from "playwright";
import { type FormContext, verifyFormContext } from "./form.js";
import { extractInlineJson } from "./http.js";
import { SIRADIG_BASE_URL } from "./session.js";

export type SubmittedForm = {
  id: string;
  number: number;
  description: string;
  submittedAt: string;
};

/** A separate page preserves the draft and its confirmation dialog. */
export async function readSubmittedForms(
  page: Page,
  context: FormContext,
  timeoutMs = 15_000,
): Promise<SubmittedForm[]> {
  const historyPage = await page.context().newPage();
  historyPage.setDefaultTimeout(timeoutMs);
  try {
    await historyPage.goto(new URL("jsp/verFormulariosEnviados.do", SIRADIG_BASE_URL).href, {
      waitUntil: "load",
      timeout: timeoutMs,
    });
    await verifyFormContext(historyPage, { period: context.period, person: context.person.id });
    const table = historyPage.locator("#tabla_formularios");
    await table.waitFor({ state: "attached", timeout: timeoutMs });
    const inlineForms = extractInlineJson(await historyPage.content(), "datosFormulariosJSON");
    const rows = await table.locator("tbody tr").evaluateAll((elements) =>
      elements.map((element) => {
        const cells = Array.from(element.querySelectorAll("td")).map(
          (cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "",
        );
        return {
          id: element.getAttribute("data-id-reg") ?? "",
          number: Number(cells[0]),
          description: cells[1] ?? "",
          submittedAt: cells[2] ?? "",
        };
      }),
    );
    if (
      (Array.isArray(inlineForms) && inlineForms.length !== rows.length) ||
      (!Array.isArray(inlineForms) && rows.length === 0) ||
      rows.some(
        (row) =>
          !/^\d+$/.test(row.id) ||
          !Number.isSafeInteger(row.number) ||
          row.number < 1 ||
          !row.description ||
          !/^\d{2}\/\d{2}\/\d{4}$/.test(row.submittedAt),
      ) ||
      new Set(rows.map((row) => row.id)).size !== rows.length ||
      new Set(rows.map((row) => row.number)).size !== rows.length
    ) {
      throw new Error("El historial de formularios enviados de ARCA tiene un formato desconocido.");
    }
    return rows;
  } finally {
    await historyPage.close();
  }
}

/** Only a single next version with a new record ID can confirm this attempt. */
export function findNewSubmittedForm(
  before: SubmittedForm[],
  after: SubmittedForm[],
): SubmittedForm | null {
  const previousIds = new Set(before.map((form) => form.id));
  const currentIds = new Set(after.map((form) => form.id));
  const added = after.filter((form) => !previousIds.has(form.id));
  const previousNumber = before.reduce((maximum, form) => Math.max(maximum, form.number), 0);
  if (
    added.length !== 1 ||
    before.some((form) => !currentIds.has(form.id)) ||
    added[0].number !== previousNumber + 1
  )
    return null;
  return added[0];
}
