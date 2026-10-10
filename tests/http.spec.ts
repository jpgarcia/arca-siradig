import { expect, test } from "@playwright/test";
import { parseDeductionsJson, readDeductions } from "../src/arca/deductions.js";
import { parseEmployeesJson, readEmployees } from "../src/arca/employees.js";
import {
  decodeSiradigHtml,
  extractInlineJson,
  fetchSiradigJson,
  type SiradigRequestClient,
} from "../src/arca/http.js";

const workerBase = "https://serviciosjava2.afip.gob.ar/radig/jsp/";
const employeeTable = {
  titulos: [
    "CUIT",
    "Razón Social / Apellido y Nombre",
    "Fecha Inicio",
    "Fecha Fin",
    "Agente de Retención",
  ],
  clases: [null, null, "fecha", "fecha", null],
  filas: [{ idReg: 123, celdas: [30000000001, "SAMPLE EMPLOYER", "01/01/2026", "", "Sí"] }],
};
const deductionGroups = [
  {
    titulo: "Gastos Médicos y Paramédicos",
    tipo: 7,
    linkAltaEdicion: "verGastosMedicos.do",
    datosTabla: {
      titulos: ["CUIT", "Denominación", "Período", "Importe"],
      clases: [],
      filas: [{ idReg: 456, celdas: ["30000000001", "SAMPLE ENTITY", "Marzo", "1.234,00"] }],
    },
  },
];

function mockRequest(body: string, status = 200, contentType = "text/html; charset=utf-8") {
  const calls: Array<{ url: string; options: unknown }> = [];
  let disposed = false;
  const client: SiradigRequestClient = {
    get: async (url, options) => {
      calls.push({ url, options });
      return {
        status: () => status,
        headers: () => ({ "content-type": contentType }),
        body: async () => Buffer.from(body),
        dispose: async () => {
          disposed = true;
        },
      };
    },
  };
  return { client, calls, isDisposed: () => disposed };
}

function inlineData(variable: string, value: unknown): string {
  return `<script>var ${variable} = ${JSON.stringify(value)};</script>`;
}

test("extracts nested multiline JSON containing escaped quotes, braces, and semicolons", () => {
  const value = { filas: [{ celdas: ['a } ]; "; \\ b', null, 12] }] };
  const html = `<p>var data = {"fake":true};</p><script>var data =\n${JSON.stringify(value, null, 2)}; doSomething();</script>`;
  expect(extractInlineJson(html, "data")).toEqual(value);
  expect(extractInlineJson(inlineData("data", []), "data")).toEqual([]);
});

test("decodes ARCA Latin-1 HTML before parsing accented text", () => {
  const html =
    '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">' +
    inlineData("data", { name: "Razón Social", agent: "Sí" });
  const body = Buffer.from(html, "latin1");
  expect(extractInlineJson(decodeSiradigHtml(body, "text/html"), "data")).toEqual({
    name: "Razón Social",
    agent: "Sí",
  });
  expect(decodeSiradigHtml(Buffer.from("Sí"), "text/html; charset=utf-8")).toBe("Sí");
});

test("does not evaluate JavaScript expressions or accept malformed or missing JSON", () => {
  expect(
    extractInlineJson('<script>var data = {"filas": []}.run();</script>', "data"),
  ).toBeUndefined();
  expect(extractInlineJson("<script>var data = {filas: []};</script>", "data")).toBeUndefined();
  expect(
    extractInlineJson('<script>var data = JSON.parse("[]");</script>', "data"),
  ).toBeUndefined();
  expect(extractInlineJson('<script>var data = {"filas": [</script>', "data")).toBeUndefined();
  expect(extractInlineJson("<script>var other = [];</script>", "data")).toBeUndefined();
});

test("fetches only the consultation endpoint without following redirects and disposes its response", async () => {
  const mock = mockRequest(inlineData("datosEmpleadoresJSON", employeeTable));
  expect(
    await fetchSiradigJson(mock.client, "verMenuEmpleadores.do", "datosEmpleadoresJSON"),
  ).toEqual(employeeTable);
  expect(mock.calls).toEqual([
    {
      url: `${workerBase}verMenuEmpleadores.do`,
      options: { maxRedirects: 0, maxRetries: 0, timeout: 15_000 },
    },
  ]);
  expect(mock.isDisposed()).toBe(true);
  await expect(fetchSiradigJson(mock.client, "guardar.do", "data")).rejects.toThrow(
    "consulta permitida",
  );
  await expect(fetchSiradigJson(mock.client, "https://example.com/", "data")).rejects.toThrow(
    "consulta permitida",
  );
  expect(mock.calls).toHaveLength(1);
});

test("requests with redirects, errors, non-HTML, or expired-session HTML require browser fallback", async () => {
  for (const [status, contentType, body] of [
    [302, "text/html", inlineData("data", [])],
    [500, "text/html", inlineData("data", [])],
    [200, "application/json", inlineData("data", [])],
    [200, "text/html", "<p>El usuario no está logueado</p>"],
  ] as const) {
    const mock = mockRequest(body, status, contentType);
    expect(await fetchSiradigJson(mock.client, "verMenuEmpleadores.do", "data")).toBeUndefined();
    expect(mock.isDisposed()).toBe(true);
  }
  const unavailable: SiradigRequestClient = {
    get: async () => {
      throw new Error("Network failure");
    },
  };
  expect(await fetchSiradigJson(unavailable, "verMenuEmpleadores.do", "data")).toBeUndefined();
});

test("maps observed embedded JSON schemas to existing CLI outputs and rejects changed rows", () => {
  expect(parseEmployeesJson(employeeTable)).toEqual([
    {
      id: "123",
      cuit: "30000000001",
      name: "SAMPLE EMPLOYER",
      startDate: "01/01/2026",
      endDate: null,
      withholdingAgent: "Sí",
    },
  ]);
  expect(parseDeductionsJson(deductionGroups)).toEqual([
    {
      id: "456",
      type: "gastos-medicos",
      cuit: "30000000001",
      name: "SAMPLE ENTITY",
      period: "Marzo",
      amount: "1.234,00",
    },
  ]);
  expect(parseEmployeesJson({ filas: [{ idReg: 1, celdas: ["changed"] }] })).toBeNull();
  expect(parseDeductionsJson([{ datosTabla: { filas: [] } }])).toBeNull();
  expect(parseEmployeesJson({ filas: [] })).toEqual([]);
  expect(parseDeductionsJson([])).toEqual([]);
});

test("reads both lists via HTTP without navigating or executing the returned scripts", async ({
  page,
}) => {
  await page.setContent("<p>Existing menu</p>");
  const initialUrl = page.url();
  const employerMock = mockRequest(
    inlineData("datosEmpleadoresJSON", employeeTable) +
      '<script>throw new Error("This must never execute")</script>',
  );
  expect(await readEmployees(page, employerMock.client)).toEqual(parseEmployeesJson(employeeTable));
  const deductionMock = mockRequest(inlineData("datosDeduccionesAgrupadasJSON", deductionGroups));
  expect(await readDeductions(page, deductionMock.client)).toEqual(
    parseDeductionsJson(deductionGroups),
  );
  expect(page.url()).toBe(initialUrl);
  await expect(page.getByText("Existing menu")).toBeVisible();
});

test("falls back to browser employees when the HTTP response format changes", async ({ page }) => {
  await page.route(`${workerBase}verMenuEmpleadores.do`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<table id="nueva_tabla_empleadores"><tbody>
      <tr data-id-reg="123"><td>30000000001</td><td>SAMPLE EMPLOYER</td><td>01/01/2026</td><td></td><td>Sí</td></tr>
    </tbody></table>`,
    }),
  );
  await page.setContent("Existing menu");
  // Browser navigation resolves the same absolute URL after the HTTP attempt fails.
  await page.route(`${workerBase}verMenuEmpleado.do`, (route) => route.fulfill({ body: "Menu" }));
  await page.goto(`${workerBase}verMenuEmpleado.do`);
  const mock = mockRequest(
    inlineData("datosEmpleadoresJSON", { filas: [{ idReg: 1, celdas: [] }] }),
  );
  expect(await readEmployees(page, mock.client)).toEqual(parseEmployeesJson(employeeTable));
  expect(page.url()).toBe(`${workerBase}verMenuEmpleadores.do`);
});

test("falls back to browser deductions on session expiry so the CLI can refresh authentication", async ({
  page,
}) => {
  const expiredUrl = "https://portalcf.cloud.afip.gob.ar/portal/app/expiredSession";
  await page.route(`${workerBase}verMenuEmpleado.do`, (route) => route.fulfill({ body: "Menu" }));
  await page.route(`${workerBase}verMenuDeducciones.do`, (route) =>
    route.fulfill({ status: 302, headers: { location: expiredUrl } }),
  );
  await page.route(expiredUrl, (route) => route.fulfill({ body: "Session expired" }));
  await page.goto(`${workerBase}verMenuEmpleado.do`);
  expect(await readDeductions(page, mockRequest("", 302).client)).toEqual([]);
  expect(new URL(page.url()).hash).toBe("#header_deducciones");
  expect(page.url().split("#")[0]).toBe(expiredUrl);
});
