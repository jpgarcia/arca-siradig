import "dotenv/config";

import { chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { loginToArca, openSiradigFromPortal } from "../src/arca/session.js";
import { writePrivateFile } from "../src/files/private.js";
import { safeErrorMessage } from "../src/security/errors.js";

type ElementSummary = {
  tag: string;
  type: string | null;
  name: string | null;
  id: string | null;
  className: string | null;
  text: string;
  value: string | null;
  href: string | null;
  onclick: string | null;
};

async function main(): Promise<void> {
  const cuit = process.env.ARCA_CUIT;
  const password = process.env.ARCA_PASSWORD;

  if (!cuit || !password) {
    throw new Error("Falta ARCA_CUIT o ARCA_PASSWORD en .env.");
  }

  const outputDir = await mkdtemp(join(tmpdir(), "arca-siradig-inspection-"));
  await chmod(outputDir, 0o700);
  console.log(`Carpeta privada de inspección: ${outputDir}`);
  console.log(
    "Las capturas contienen datos fiscales personales. Mantenelas privadas y usá datos ficticios en las pruebas.",
  );

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginToArca(page, { cuit, password });
    await snapshot(page, outputDir, "01-after-login");
    const siradigPage = await openSiradigFromPortal(page);
    await siradigPage.waitForLoadState("domcontentloaded").catch(() => undefined);

    await maybeAcceptReminder(siradigPage);
    await snapshot(siradigPage, outputDir, "02-person-selection");

    const personButtons = siradigPage.locator('input[type="button"].btn_empresa');
    const personCount = await personButtons.count();
    if (personCount === 0) {
      throw new Error(
        "No se encontraron botones .btn_empresa en la pantalla de selección de persona.",
      );
    }

    await personButtons.first().click();
    await siradigPage.waitForLoadState("domcontentloaded").catch(() => undefined);
    await maybeAcceptReminder(siradigPage);
    await snapshot(siradigPage, outputDir, "03-after-person-selection");

    const datosPersonales = siradigPage.locator("#btn_datos_personales");
    const datosVisible = await datosPersonales.isVisible({ timeout: 5_000 }).catch(() => false);

    if (datosVisible) {
      await datosPersonales.click();
      await siradigPage.waitForLoadState("domcontentloaded").catch(() => undefined);
      await snapshot(siradigPage, outputDir, "04-personal-data");
    }

    await siradigPage.goto("https://serviciosjava2.afip.gob.ar/radig/jsp/verMenuEmpleadores.do", {
      waitUntil: "domcontentloaded",
    });
    await snapshot(siradigPage, outputDir, "05-employees-menu");

    const employeeId = await siradigPage
      .locator("#nueva_tabla_empleadores tbody tr")
      .first()
      .getAttribute("data-id-reg")
      .catch(() => null);
    if (employeeId) {
      await siradigPage.goto(
        new URL(`verEmpleador.do?id=${encodeURIComponent(employeeId)}`, siradigPage.url()).href,
        { waitUntil: "domcontentloaded" },
      );
      await snapshot(siradigPage, outputDir, "06-employee-detail");
    }

    await siradigPage.goto(
      "https://serviciosjava2.afip.gob.ar/radig/jsp/verMenuDeducciones.do#header_deducciones",
      { waitUntil: "domcontentloaded" },
    );
    await snapshot(siradigPage, outputDir, "07-deductions-menu");

    const deductionLinks = await siradigPage
      .locator('a[href*="ver"][href*=".do"]')
      .evaluateAll((links) =>
        links.map((link) => ({
          text: (link.textContent ?? "").replace(/\s+/g, " ").trim(),
          href: link.getAttribute("href"),
          id: link.getAttribute("id"),
          className: link.getAttribute("class"),
        })),
      );
    await writePrivateFile(
      join(outputDir, "07-deductions-links.json"),
      JSON.stringify(deductionLinks, null, 2),
    );
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(`Capturas con datos sensibles guardadas en ${outputDir}`);
}

async function maybeAcceptReminder(page: Page): Promise<void> {
  const dialog = page
    .locator(".ui-dialog")
    .filter({ hasText: "Recordatorio - Formulario" })
    .first();
  const visible = await dialog.isVisible({ timeout: 5_000 }).catch(() => false);
  if (visible) {
    await dialog.getByRole("button", { name: "Aceptar" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
  }
}

async function snapshot(page: Page, outputDir: string, name: string): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  const html = await page.content();
  const summary = await summarize(page);
  const url = page.url();

  await writePrivateFile(join(outputDir, `${name}.html`), html);
  await writePrivateFile(
    join(outputDir, `${name}.json`),
    JSON.stringify({ url, summary }, null, 2),
  );
  await writePrivateFile(join(outputDir, `${name}.png`), await page.screenshot({ fullPage: true }));
}

async function summarize(page: Page): Promise<ElementSummary[]> {
  return page
    .locator("input, button, a, select, textarea, form, fieldset, legend")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type"),
        name: element.getAttribute("name"),
        id: element.getAttribute("id"),
        className: element.getAttribute("class"),
        text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
        value: element.getAttribute("value"),
        href: element.getAttribute("href"),
        onclick: element.getAttribute("onclick"),
      })),
    );
}

main().catch((error: unknown) => {
  const message = safeErrorMessage(error, [process.env.ARCA_PASSWORD, process.env.ARCA_CUIT]);
  console.error(message);
  process.exitCode = 1;
});
