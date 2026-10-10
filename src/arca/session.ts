import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  chromium,
  type Page,
} from "playwright";
import { safeErrorMessage } from "../security/errors.js";
import type { ArcaCredentials } from "../types.js";

export const ARCA_LOGIN_URL = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
export const SIRADIG_LOGIN_URL = `${ARCA_LOGIN_URL}?action=SYSTEM&system=radig`;
export const SIRADIG_BASE_URL = "https://serviciosjava2.afip.gob.ar/radig/";
const SIRADIG_EMPLOYER_BASE_URL = "https://serviciosjava2.afip.gob.ar/radig_emp/";
export const ARCA_PORTAL_URL = "https://portalcf.cloud.afip.gob.ar/portal/app/";
export const ARCA_PORTAL_EXPIRED_SESSION_URL = `${ARCA_PORTAL_URL}expiredSession`;
export const SIRADIG_SERVICE_NAME = "SiRADIG - Trabajador";

export type BrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export type BrowserSessionOptions = {
  headless?: boolean;
  storageState?: BrowserContextOptions["storageState"];
};

export class ArcaLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArcaLoginError";
  }
}

export async function createBrowserSession(
  options: BrowserSessionOptions = {},
): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless: options.headless ?? false });
  const context = await browser.newContext({ storageState: options.storageState });
  const page = await context.newPage();

  return { browser, context, page };
}

export async function closeBrowserSession(session: BrowserSession): Promise<void> {
  try {
    await session.context.close();
  } finally {
    await session.browser.close();
  }
}

export async function loginToArca(page: Page, credentials: ArcaCredentials): Promise<void> {
  try {
    await performLogin(page, credentials);
  } catch (error) {
    const message = safeErrorMessage(error, [credentials.password, credentials.cuit]);
    if (error instanceof ArcaLoginError) throw new ArcaLoginError(message);
    // Do not retain the original error or cause: Playwright may include fill values.
    throw new Error(message);
  }
}

async function performLogin(page: Page, credentials: ArcaCredentials): Promise<void> {
  await page.goto(SIRADIG_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page
    .locator('[id="F1:username"], input[type="number"], input[role="spinbutton"]')
    .first()
    .fill(credentials.cuit);
  await page.getByRole("button", { name: "Siguiente" }).click();

  await waitForLoginOutcome(page, "password");
  const cuitErrorMessage = await getLoginErrorMessage(page);
  if (cuitErrorMessage) {
    throw new ArcaLoginError(cuitErrorMessage);
  }

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
  await passwordInput.fill(credentials.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await waitForLoginOutcome(page, "authenticated");

  const loginErrorMessage = await getLoginErrorMessage(page);
  if (loginErrorMessage) {
    throw new ArcaLoginError(loginErrorMessage);
  }
}

export async function openSiradigFromPortal(page: Page): Promise<Page> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  if (page.url().startsWith(SIRADIG_BASE_URL) || page.url().startsWith(SIRADIG_EMPLOYER_BASE_URL)) {
    await recoverWorkerSiradigPage(page);
    return page;
  }

  const portalLink = page
    .getByText(/^\s*siradig\s*[-–—]?\s*trabajador\s*$/i)
    .filter({ visible: true })
    .first();
  const viewAll = page
    .getByText(/^ver todos$/i)
    .filter({ visible: true })
    .first();
  try {
    await portalLink.or(viewAll).first().waitFor({ state: "visible", timeout: 30_000 });
    if (!(await portalLink.isVisible())) {
      await viewAll.click();
    }
    await portalLink.waitFor({ state: "visible", timeout: 30_000 });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        'Ingresaste a ARCA, pero no se encontró el servicio SiRADIG - Trabajador visible en el portal. Ejecutá login con --headless false y revisá si aparece en "Mis servicios" o si hay un aviso pendiente.',
      );
    }
    throw error;
  }

  const currentUrl = page.url();
  const popupPromise = page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null);
  const samePageNavigationPromise = page
    .waitForURL((url) => url.href !== currentUrl, { timeout: 10_000 })
    .then(() => page)
    .catch(() => null);

  await portalLink.click();

  const siradigPage = (await Promise.race([popupPromise, samePageNavigationPromise])) ?? page;
  await siradigPage.waitForLoadState("domcontentloaded").catch(() => undefined);

  await recoverWorkerSiradigPage(siradigPage);
  return siradigPage;
}

export async function recoverWorkerSiradigPage(
  page: Page,
  period = new Date().getFullYear(),
): Promise<void> {
  if (!new URL(page.url()).pathname.startsWith("/radig_emp/")) return;
  const workerUrl = new URL(
    "https://serviciosjava2.afip.gob.ar/radig/jsp/determinarContribuyente.do",
  );
  workerUrl.searchParams.set("codigo", String(period));
  await page.goto(workerUrl.href, { waitUntil: "domcontentloaded" });
  assertWorkerSiradigUrl(page.url());
  try {
    await page
      .locator(
        '#btn_datos_personales, form[name="seleccionaEmpresaForm"], input[type="button"].btn_empresa',
      )
      .first()
      .waitFor({ state: "attached", timeout: 30_000 });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        "No se pudo abrir SiRADIG - Trabajador desde la sesión de Empleador. Revisá el acceso al servicio con --headless false.",
      );
    }
    throw error;
  }
}

export function assertWorkerSiradigUrl(url: string): void {
  if (new URL(url).pathname.startsWith("/radig_emp/")) {
    throw new Error(
      'Se abrió SiRADIG - Empleador (/radig_emp/). Este CLI requiere SiRADIG - Trabajador (/radig/). Volvé al portal y verificá que el servicio "SiRADIG - Trabajador" esté disponible en "Ver Todos".',
    );
  }
}

export function isExpiredPortalSessionUrl(url: string): boolean {
  return url.startsWith(ARCA_PORTAL_EXPIRED_SESSION_URL);
}

async function waitForLoginOutcome(page: Page, stage: "password" | "authenticated"): Promise<void> {
  try {
    await page.waitForFunction(
      ({ stage, portalUrl, workerUrl, employerUrl }) => {
        const hasError = Array.from(document.querySelectorAll('[id="F1:msg"], .text-danger')).some(
          (element) => element.getClientRects().length > 0 && element.textContent?.trim(),
        );
        if (hasError) return true;
        if (stage === "password") {
          return Array.from(document.querySelectorAll('input[type="password"]')).some(
            (element) => element.getClientRects().length > 0,
          );
        }
        return (
          window.location.href.startsWith(portalUrl) ||
          window.location.href.startsWith(workerUrl) ||
          window.location.href.startsWith(employerUrl)
        );
      },
      {
        stage,
        portalUrl: ARCA_PORTAL_URL,
        workerUrl: SIRADIG_BASE_URL,
        employerUrl: SIRADIG_EMPLOYER_BASE_URL,
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ArcaLoginError(
        stage === "password"
          ? "ARCA no mostró el campo de clave ni un mensaje de error después de enviar el CUIT/CUIL."
          : "ARCA no confirmó el ingreso a SiRADIG o al portal. Revisá si requiere una verificación adicional con --headless false.",
      );
    }
    throw error;
  }
}

async function getLoginErrorMessage(page: Page): Promise<string | null> {
  const messages = page.locator('[id="F1:msg"], .text-danger');
  for (const message of await messages.all()) {
    if (!(await message.isVisible())) continue;
    const text = (await message.textContent())?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return null;
}
