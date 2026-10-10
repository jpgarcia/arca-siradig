import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "playwright";
import {
  ARCA_LOGIN_URL,
  ARCA_PORTAL_EXPIRED_SESSION_URL,
  ARCA_PORTAL_URL,
  type BrowserSession,
} from "../src/arca/session.js";
import {
  isLoginPage,
  navigateWithSessionRefresh,
  PERSON_SELECTION_URL,
  SessionError,
} from "../src/services/session.js";
import { SiradigService } from "../src/services/siradig.js";
import type { SessionStore, StoredSession } from "../src/session/store.js";

const base = "https://serviciosjava2.afip.gob.ar/radig/jsp/";
const selected = { id: "0", name: "SAMPLE PERSON" };
const header = (period: number, id = "20000000001") => `
  <table id="encabezado_usuario"><tr><th>Representando a:</th><td>${id} - SAMPLE PERSON</td></tr></table>
  <div id="breadCrumb0">F572 Web | Período ${period}</div>
  <a id="btn_datos_personales" href="verDatosPersonales.do">Datos Personales</a>`;
const selection = `<form name="seleccionaEmpresaForm">
  <input id="idcontribuyente" type="hidden">
  <input type="button" class="btn_empresa" value="SAMPLE PERSON"
    onclick="document.getElementById('idcontribuyente').value='0'; location.href='verMenuEmpleado.do'">
</form>`;

function store(): SessionStore {
  let stored: StoredSession | null = {
    cuit: "20000000002",
    createdAt: "2026-01-01T00:00:00Z",
    selectedPerson: selected,
    storageState: { cookies: [], origins: [] },
  };
  return {
    path: "synthetic-session.json",
    read: async () => stored,
    write: async (value) => {
      stored = value;
    },
    clear: async () => {
      stored = null;
    },
  };
}

async function mockPortal(context: BrowserContext, wrongPreview = false) {
  const requests: string[] = [];
  let currentPeriod = 2026;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    let body: string;
    if (url.href === PERSON_SELECTION_URL) body = selection;
    else if (url.href === `${base}verMenuEmpleado.do`) body = header(currentPeriod);
    else if (url.pathname.endsWith("/determinarContribuyente.do")) {
      currentPeriod = Number(url.searchParams.get("codigo"));
      body = header(currentPeriod);
    } else if (url.href === `${base}vistaPreviaFormulario.do`) {
      body = `${header(currentPeriod, wrongPreview ? "20000000003" : undefined)}
        <div id="contenido"><table id="tabla_datos_personales"><tr><th>SAMPLE PERSON</th></tr></table>
        <h3>3 - Deducciones y desgravaciones</h3><table class="tabla_vista_previa">
          <tr><th>Deducciones</th><th>Importe Total: $</th><th>123,45</th></tr>
        </table></div>`;
    } else if (url.href === ARCA_PORTAL_URL)
      body = `<a href="${PERSON_SELECTION_URL}">SiRADIG - Trabajador</a>`;
    else if (url.href === ARCA_PORTAL_EXPIRED_SESSION_URL) body = "Expired";
    else if (url.href === ARCA_LOGIN_URL) body = "<input type='number'>";
    else {
      await route.abort();
      return;
    }
    await route.fulfill({ contentType: "text/html; charset=utf-8", body });
  });
  return requests;
}

test("service binds the internal person selector to the actual CUIT and requested fiscal year", async ({
  browser,
}) => {
  let closed = 0;
  const service = new SiradigService({
    store: store(),
    createBrowser: async (options) => {
      const context = await browser.newContext({ storageState: options?.storageState });
      await mockPortal(context);
      const sessionBrowser = new Proxy(browser, {
        get: (target, key) =>
          key === "close"
            ? async () => {
                closed += 1;
              }
            : Reflect.get(target, key),
      });
      return { browser: sessionBrowser, context, page: await context.newPage() };
    },
  });
  const summary = await service.formSummary({ person: "0", period: 2025 });
  expect(summary).toMatchObject({
    period: 2025,
    person: { id: "20000000001", name: "SAMPLE PERSON" },
    source: "draft-preview",
  });
  expect(closed).toBe(1);
  await service.close();
});

test("service refuses a preview for another person and still closes its browser", async ({
  browser,
}) => {
  let closed = 0;
  const service = new SiradigService({
    store: store(),
    createBrowser: async () => {
      const context = await browser.newContext();
      await mockPortal(context, true);
      const sessionBrowser = new Proxy(browser, {
        get: (target, key) =>
          key === "close"
            ? async () => {
                closed += 1;
              }
            : Reflect.get(target, key),
      });
      return { browser: sessionBrowser, context, page: await context.newPage() };
    },
  });
  await expect(service.formSummary({ person: "0", period: 2026 })).rejects.toThrow(
    "persona diferente",
  );
  expect(closed).toBe(1);
  await service.close();
});

test("concurrent MCP consultations serialize person and fiscal context and reload the session", async ({
  browser,
}) => {
  let active = 0;
  let peak = 0;
  const service = new SiradigService({
    store: store(),
    createBrowser: async () => {
      active += 1;
      peak = Math.max(peak, active);
      const context = await browser.newContext();
      await mockPortal(context);
      const sessionBrowser = new Proxy(browser, {
        get: (target, key) =>
          key === "close"
            ? async () => {
                active -= 1;
              }
            : Reflect.get(target, key),
      });
      return { browser: sessionBrowser, context, page: await context.newPage() };
    },
  });
  const results = await Promise.all([
    service.formShow({ period: 2025 }),
    service.formShow({ period: 2026 }),
  ]);
  expect(results.map((result) => result.period)).toEqual([2025, 2026]);
  expect(peak).toBe(1);
  expect(active).toBe(0);
  await service.close();
});

test("expired read refreshes once and restores the requested person and year even if its parser throws", async ({
  page,
  context,
  browser,
}) => {
  const requests = await mockPortal(context);
  const session: BrowserSession = { browser, context, page };
  const sessionStore = store();
  const form = { period: 2025, person: { id: "20000000001", name: "SAMPLE PERSON" } };
  let attempts = 0;
  await navigateWithSessionRefresh(
    session,
    sessionStore,
    "20000000002",
    async (current) => {
      attempts += 1;
      if (attempts === 1) {
        await current.goto(ARCA_PORTAL_EXPIRED_SESSION_URL);
        throw new Error("Synthetic parser cannot find the preview");
      }
      expect(await current.locator("#breadCrumb0").innerText()).toContain("2025");
      await current.goto(`${base}vistaPreviaFormulario.do`);
    },
    form,
  );
  expect(attempts).toBe(2);
  expect(requests).toContain(`${base}determinarContribuyente.do?codigo=2025`);
  expect((await sessionStore.read())?.selectedPerson).toEqual(selected);
});

test("a redirect to login produces SESSION_EXPIRED instead of a selector timeout", async ({
  page,
  context,
  browser,
}) => {
  await mockPortal(context);
  const operation = navigateWithSessionRefresh(
    { browser, context, page },
    store(),
    "20000000002",
    (current) => current.goto(ARCA_LOGIN_URL),
  );
  await expect(operation).rejects.toBeInstanceOf(SessionError);
  await expect(operation).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
});

test("disabled draft writes fail before any browser or ARCA access", async () => {
  const service = new SiradigService({
    createBrowser: async () => {
      throw new Error("Browser must not launch");
    },
  });
  expect(() =>
    service.removeReceipt({
      person: "0",
      period: 2026,
      cuit: "30000000001",
      number: "0000100000001",
    }),
  ).toThrow("--allow-writes");
  await service.close();
});

test("numeric fields in SiRADIG forms are not treated as an expired login", async () => {
  const page = {
    url: () => `${base}verDatosPersonales.do`,
    getByRole: () => {
      throw new Error("Numeric controls must not be inspected on a worker form");
    },
  } as unknown as Page;
  expect(await isLoginPage(page)).toBe(false);
});
