import type { Page } from "playwright";
import type { Person, ReminderModalInfo } from "../types.js";
import { assertWorkerSiradigUrl, recoverWorkerSiradigPage } from "./session.js";

export async function acceptReminderModalIfPresent(page: Page): Promise<ReminderModalInfo | null> {
  return acceptReminderModal(page);
}

export async function acceptReminderModal(
  page: Page,
  options: { timeoutMs?: number } = {},
): Promise<ReminderModalInfo | null> {
  const dialog = page
    .locator(".ui-dialog")
    .filter({ hasText: "Recordatorio - Formulario" })
    .first();

  const visible = await dialog
    .isVisible({ timeout: options.timeoutMs ?? 1_500 })
    .catch(() => false);
  if (!visible) {
    return null;
  }

  const title = normalize(
    await dialog
      .locator(".ui-dialog-title")
      .first()
      .textContent()
      .catch(() => ""),
  );
  const description = normalize(
    await dialog
      .locator("p")
      .first()
      .textContent()
      .catch(() => ""),
  );

  await dialog.getByRole("button", { name: "Aceptar" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);

  return { title, description };
}

export async function waitForPersonSelection(
  page: Page,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  assertWorkerSiradigUrl(page.url());
  try {
    await page
      .locator('form[name="seleccionaEmpresaForm"], input[type="button"].btn_empresa')
      .first()
      .waitFor({ state: "attached", timeout: options.timeoutMs ?? 30_000 });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        "SiRADIG no mostró la pantalla de selección de personas. Revisá la pantalla con --headless false; no se pudo confirmar el listado de personas.",
      );
    }
    throw error;
  }
}

export async function listPersons(page: Page): Promise<Person[]> {
  const persons = await page.locator('input[type="button"].btn_empresa').evaluateAll((buttons) =>
    buttons
      .map((button) => {
        const name = button.getAttribute("value")?.trim() ?? "";
        const onclick = button.getAttribute("onclick") ?? "";
        const match = onclick.match(/idcontribuyente'\)\.value='([^']+)'/i);
        const id = match?.[1] ?? null;

        return {
          id,
          name,
        };
      })
      .filter((person) => person.name.length > 0),
  );

  return dedupePersons(persons);
}

export async function selectPerson(page: Page, personIdentifier: string): Promise<void> {
  return selectPersonOnWorkerPage(page, personIdentifier, true);
}

async function selectPersonOnWorkerPage(
  page: Page,
  personIdentifier: string,
  allowRecovery: boolean,
): Promise<void> {
  assertWorkerSiradigUrl(page.url());
  const personButtons = page.locator('input[type="button"].btn_empresa');

  for (let index = 0; index < (await personButtons.count()); index += 1) {
    const button = personButtons.nth(index);
    const value = (await button.getAttribute("value"))?.trim();
    const onclick = await button.getAttribute("onclick");
    const id = onclick ? extractContribuyenteId(onclick) : null;

    if (value === personIdentifier || id === personIdentifier) {
      await button.click();
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      try {
        await page.waitForFunction(
          () =>
            document.querySelector("#btn_datos_personales") !== null ||
            window.location.pathname.startsWith("/radig_emp/"),
          undefined,
          { timeout: 15_000 },
        );
        if (allowRecovery && new URL(page.url()).pathname.startsWith("/radig_emp/")) {
          await recoverWorkerSiradigPage(page);
          if (!(await page.locator("#btn_datos_personales").count())) {
            await selectPersonOnWorkerPage(page, personIdentifier, false);
          }
        }
        assertWorkerSiradigUrl(page.url());
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new Error(
            'Después de seleccionar la persona, SiRADIG no mostró el menú con "Datos Personales". Verificá que se haya abierto SiRADIG - Trabajador y revisá si hay un aviso pendiente con --headless false.',
          );
        }
        throw error;
      }
      return;
    }
  }

  throw new Error(`Person "${personIdentifier}" was not found.`);
}

function normalize(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function extractContribuyenteId(onclick: string): string | null {
  const match = onclick.match(/idcontribuyente'\)\.value='([^']+)'/i);
  return match?.[1] ?? null;
}

function dedupePersons(persons: Person[]): Person[] {
  const seen = new Set<string>();
  const deduped: Person[] = [];

  for (const person of persons) {
    const key = `${person.id ?? ""}:${person.name}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(person);
  }

  return deduped;
}
