import type { Locator, Page } from "playwright";
import type { MenuItem } from "../types.js";

export const ENABLED_MENU_ITEM = "Datos Personales";
const MENU_BUTTON_SELECTOR = 'a[id^="btn_"].ui-button';

export async function listMenuItems(page: Page): Promise<MenuItem[]> {
  await page.locator("#btn_datos_personales").waitFor({ state: "attached", timeout: 15_000 });

  const labels = await page.locator(MENU_BUTTON_SELECTOR).evaluateAll((buttons) =>
    buttons
      .filter((button) => !["btn_nuevo_borrador", "btn_guardar"].includes(button.id))
      .map((button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((label) => label.length > 0),
  );

  return [...new Set(labels)].map((label) => ({
    label,
    enabled: label === ENABLED_MENU_ITEM,
  }));
}

export async function selectMenuItem(page: Page, label: string): Promise<void> {
  if (label !== ENABLED_MENU_ITEM) {
    throw new Error(`La acción "${label}" todavía no está implementada.`);
  }

  await navigateByHref(page, page.locator("#btn_datos_personales"));
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

export async function returnToMainMenu(page: Page): Promise<void> {
  const mainMenuLink = page
    .locator("#btn_volver, #btn_volver_menu")
    .filter({ hasText: "Menú Principal" })
    .first();

  await mainMenuLink.waitFor({ state: "visible", timeout: 15_000 });
  await mainMenuLink.click();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

async function navigateByHref(page: Page, link: Locator): Promise<void> {
  const href = await link.getAttribute("href");
  if (!href || href === "#") {
    throw new Error("La acción seleccionada no tiene un enlace al que se pueda acceder.");
  }

  await page.goto(new URL(href, page.url()).href, { waitUntil: "domcontentloaded" });
}
