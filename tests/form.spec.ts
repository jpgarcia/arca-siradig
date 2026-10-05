import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  openFormPreview,
  printFormDraft,
  readFormContext,
  readFormSummary,
  selectFormPeriod,
  verifyFormContext,
} from "../src/arca/form.js";
import { parseCliOptions } from "../src/cli/options.js";
import { renderFormSummary } from "../src/cli/render.js";

const base = "https://serviciosjava2.afip.gob.ar/radig/jsp/";
const person = "20000000001";
const contextHtml = (period: number) => `
  <table id="encabezado_usuario"><tr><th>Usuario:</th><td>20000000002 - USER</td></tr>
    <tr><th>Representando a:</th><td>${person} - SAMPLE PERSON</td></tr></table>
  <div id="breadCrumb0">F572 Web | Período ${period}</div>`;

// Synthetic nested tables mirror the observed preview, with no live tax data.
const previewHtml = `${contextHtml(2026)}
  <div id="contenido"><table>
    <tr><th>Agente de retención: CUIT 30000000002 - SAMPLE EMPLOYER</th></tr>
    <tr><td>Carácter de la presentación: RECTIFICATIVA</td></tr>
    <tr><td><table id="tabla_datos_personales"><tr><th>Apellido y Nombre: SAMPLE PERSON</th></tr></table></td></tr>
    <tr><td><table>
      <tr><td><h3>1 - Detalles de las cargas de familia</h3></td></tr>
      <tr><td><table class="tabla_vista_previa"><tr><th>Apellido y Nombre</th></tr></table></td></tr>
      <tr><td><h3>3 - Deducciones y desgravaciones</h3></td></tr>
      <tr><td><table class="tabla_vista_previa">
        <tr><th>Deducciones y desgravaciones</th><th>Importe Total: $</th><th>1.234,56</th></tr>
        <tr><td colspan="3"><table class="tabla_vista_previa">
          <tr><th>Gastos Médicos y Paramédicos</th><th>Subtotal: $</th><th>1.234,56</th></tr>
          <tr><td colspan="3"><table class="tabla_vista_previa">
            <tr><th>30000000001 - SAMPLE PROVIDER</th><th>Subtotal: $</th><th>1.234,56</th></tr>
            <tr><td>Enero</td><td>$</td><td>234,56</td></tr>
            <tr><td>Febrero - Marzo</td><td>2 x $</td><td>500,00</td><td>$</td><td>1.000,00</td></tr>
          </table></td></tr>
        </table></td></tr>
      </table></td></tr>
      <tr><td><h3>4 - Otras Retenciones, Percepciones y Pagos a Cuenta</h3></td></tr>
      <tr><td><table class="tabla_vista_previa"><tr><th>Retenciones, Percepciones y Pagos a Cuenta</th>
        <th>Importe Total: $</th><th>0,00</th></tr></table></td></tr>
    </table></td></tr>
  </table></div>
  <a id="btn_imprimir_borrador" href="generarBorradorPDF.do">Imprimir Borrador</a>
  <a id="btn_enviar_empleador" href="#" onclick="throw new Error('Must not submit')">Enviar al Empleador...</a>`;

test("supports nested form deductions with explicit fiscal context", () => {
  const prefix = ["form", "deductions"];
  expect(
    parseCliOptions([
      ...prefix,
      "list",
      "--period",
      "2026",
      "--person=SAMPLE PERSON",
      "--format=json",
    ]),
  ).toEqual({
    kind: "form-deductions-list",
    headless: true,
    person: "SAMPLE PERSON",
    period: 2026,
    format: "json",
  });
  const args = [
    ...prefix,
    "add-item",
    "--type=gastos-medicos",
    "--cuit=30000000001",
    "--month=1",
    "--amount=100",
  ];
  expect(() => parseCliOptions(args)).toThrow("--period is required");
  expect(parseCliOptions([...args, "--period=2026", "--person=SAMPLE PERSON"])).toMatchObject({
    kind: "form-deductions-add-item",
    period: 2026,
    person: "SAMPLE PERSON",
  });
  expect(parseCliOptions(["form", "show"])).toMatchObject({ kind: "form-show" });
  expect(parseCliOptions(["form", "summary", "--format=json"])).toMatchObject({
    kind: "form-summary",
    format: "json",
  });
  expect(parseCliOptions(["form", "print", "--path=./draft.pdf"])).toMatchObject({
    kind: "form-print",
    path: "./draft.pdf",
  });
  expect(() => parseCliOptions(["form", "print"])).toThrow("--path is required");
  expect(() => parseCliOptions(["form", "show", "--period=2026x"])).toThrow(
    "four-digit fiscal year",
  );
  expect(() => parseCliOptions(["employees", "list", "--period=2026"])).toThrow(
    "only supported for form",
  );
  expect(() => parseCliOptions(["form", "deductions", "list", "--path=x"])).toThrow(
    "only supported for form print",
  );
  expect(() =>
    parseCliOptions([
      "form",
      "deductions",
      "add-item-receipt",
      "--period=2026",
      "--date=2025-01-01",
      "--type=gastos-medicos",
    ]),
  ).toThrow("--date must belong");
});

test("rejects the removed deductions alias and directs users to the nested command", () => {
  for (const args of [
    ["deductions"],
    ["deductions", "--help"],
    ["deductions", "list"],
    ["deductions", "list", "--period=2026"],
    ["deductions", "list-receipt-types"],
    ["deductions", "show", "123"],
    ["deductions", "add-item", "--period=2026"],
    ["deductions", "add-item-receipt", "--period=2026"],
    ["deductions", "remove-item-receipt", "--period=2026"],
  ]) {
    expect(() => parseCliOptions(args)).toThrow(
      "Unknown command: deductions. Use arca-siradig form deductions <command>.",
    );
  }
});

test("reads the represented person and actual fiscal year, failing on mismatches", async ({
  page,
}) => {
  await page.setContent(contextHtml(2026));
  expect(await readFormContext(page)).toEqual({
    period: 2026,
    person: { id: person, name: "SAMPLE PERSON" },
  });
  await expect(verifyFormContext(page, { period: 2025, person })).rejects.toThrow(
    "se solicitó 2025",
  );
  await expect(verifyFormContext(page, { period: 2026, person: "20000000002" })).rejects.toThrow(
    "persona diferente",
  );
});

test("changes fiscal year and verifies ARCA's result instead of trusting the requested URL", async ({
  page,
}) => {
  await page.setContent(contextHtml(2026));
  await page.route(`${base}determinarContribuyente.do?codigo=2025`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: contextHtml(2025) }),
  );
  expect(await selectFormPeriod(page, { period: 2025, person })).toMatchObject({ period: 2025 });
  await page.route(`${base}determinarContribuyente.do?codigo=2024`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: contextHtml(2025) }),
  );
  await expect(selectFormPeriod(page, { period: 2024, person })).rejects.toThrow(
    "se solicitó 2024",
  );
});

test("reports unavailable periods without proceeding to another form", async ({ page }) => {
  await page.setContent(contextHtml(2026));
  await page.route(`${base}determinarContribuyente.do?codigo=2025`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<p>El período seleccionado es inválido o inexistente</p>",
    }),
  );
  await expect(selectFormPeriod(page, { period: 2025, person })).rejects.toThrow(
    "no permite acceder al período 2025",
  );
});

test("reselects the requested person when changing year returns a person selector", async ({
  page,
}) => {
  await page.setContent(contextHtml(2026));
  await page.route(`${base}determinarContribuyente.do?codigo=2025`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<form name="seleccionaEmpresaForm"><input type="hidden" id="idContribuyente">
        <input type="button" class="btn_empresa" value="SAMPLE PERSON"
          onclick="document.getElementById('idContribuyente').value='${person}'; location.href='verMenuEmpleado.do'">
      </form>`,
    }),
  );
  await page.route(`${base}verMenuEmpleado.do`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${contextHtml(2025)}<a id="btn_datos_personales">Datos Personales</a>`,
    }),
  );
  expect(await selectFormPeriod(page, { period: 2025, person })).toMatchObject({ period: 2025 });
  expect(await selectFormPeriod(page, { person })).toMatchObject({ period: 2025 });
});

test("keeps internal person index separate from CUIT and verifies identity across period changes", async ({
  page,
}) => {
  await page.setContent(contextHtml(2026));
  expect(
    await selectFormPeriod(page, { period: 2026, person: "SAMPLE PERSON", selector: "0" }),
  ).toMatchObject({ period: 2026, person: { id: person, name: "SAMPLE PERSON" } });
  await page.route(`${base}determinarContribuyente.do?codigo=2025`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<form name="seleccionaEmpresaForm"><input type="hidden" id="idContribuyente">
      <input type="button" class="btn_empresa" value="SAMPLE PERSON"
        onclick="document.getElementById('idContribuyente').value='0'; location.href='verMenuEmpleado.do'">
    </form>`,
    }),
  );
  await page.route(`${base}verMenuEmpleado.do`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${contextHtml(2025)}<a id="btn_datos_personales">Datos Personales</a>`,
    }),
  );
  expect(
    await selectFormPeriod(page, { period: 2025, person: "SAMPLE PERSON", selector: "0" }),
  ).toMatchObject({ period: 2025, person: { id: person } });
  await page.route(`${base}determinarContribuyente.do?codigo=2024`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: contextHtml(2024).replace(`${person} - SAMPLE PERSON`, "20000000003 - SAMPLE PERSON"),
    }),
  );
  await expect(
    selectFormPeriod(page, { period: 2024, person: "SAMPLE PERSON", selector: "0" }),
  ).rejects.toThrow(`Persona esperada (CUIT o nombre): ${person}`);
});

test("identity errors explain both identities and how to inspect person selection", async ({
  page,
}) => {
  await page.setContent(contextHtml(2026));
  await expect(verifyFormContext(page, { period: 2026, person: "OTHER PERSON" })).rejects.toThrow(
    `Persona en ARCA: CUIT ${person} - SAMPLE PERSON. Período: 2026`,
  );
  await expect(verifyFormContext(page, { period: 2026, person: "OTHER PERSON" })).rejects.toThrow(
    "arca-siradig persons list",
  );
  await expect(verifyFormContext(page, { period: 2026, person: "OTHER PERSON" })).rejects.toThrow(
    "--person <id|nombre>",
  );
  expect(await verifyFormContext(page, { person: "SAMPLE, PERSON" })).toMatchObject({
    person: { id: person },
  });
});

test("parses official totals and nested preview sections without double counting or calculating tax", async ({
  page,
}) => {
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: previewHtml }),
  );
  await openFormPreview(page);
  const summary = await readFormSummary(page);
  expect(summary).toMatchObject({
    period: 2026,
    person: { id: person },
    source: "draft-preview",
    submissionType: "RECTIFICATIVA",
    withholdingAgent: { id: "30000000002", name: "SAMPLE EMPLOYER" },
  });
  expect(summary.totals).toEqual([
    { label: "Deducciones y desgravaciones", amount: "1.234,56" },
    { label: "Retenciones, Percepciones y Pagos a Cuenta", amount: "0,00" },
  ]);
  expect(summary.sections[1].tables.flat()).toEqual([
    ["Deducciones y desgravaciones", "Importe Total: $", "1.234,56"],
    ["Gastos Médicos y Paramédicos", "Subtotal: $", "1.234,56"],
    ["30000000001 - SAMPLE PROVIDER", "Subtotal: $", "1.234,56"],
    ["Enero", "$", "234,56"],
    ["Febrero - Marzo", "2 x $", "500,00", "$", "1.000,00"],
  ]);
  const output = renderFormSummary(summary, { width: 60 });
  expect(output).toContain("F572 WEB · 2026");
  expect(output).toContain("TOTALES INFORMADOS POR ARCA");
  expect(output).toContain("Gastos Médicos y Paramédicos");
  expect(output).toContain("Subtotal · CUIT 30000000001");
  expect(output).toContain("Febrero - Marzo (2 × $ 500,00)");
  expect(output).toContain("Sin datos informados");
  expect(output).not.toContain("Apellido y Nombre:");
  expect(output).not.toContain(" | ");
  expect(output).not.toContain("\u001b");
  expect(output.split("\n").every((line) => line.length <= 60)).toBe(true);
  await page.setContent(`${contextHtml(2026)}<div id="contenido"><p>Sesión expirada</p></div>`);
  await expect(readFormSummary(page)).rejects.toThrow("formato esperado");
});

test("downloads the official draft through its button, preserves files, and rejects HTML downloads", async ({
  page,
}) => {
  const dir = await mkdtemp(join(tmpdir(), "arca-form-test-"));
  try {
    await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: previewHtml }),
    );
    await page.route(`${base}generarBorradorPDF.do`, (route) =>
      route.fulfill({
        contentType: "application/pdf",
        headers: { "content-disposition": 'attachment; filename="draft.pdf"' },
        body: "%PDF-1.4\nMOCK\n%%EOF",
      }),
    );
    await openFormPreview(page);
    const path = join(dir, "draft.pdf");
    expect(await printFormDraft(page, path)).toBe(path);
    expect(await readFile(path, "utf8")).toContain("%PDF-1.4");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const secondPath = join(dir, "draft (1).pdf");
    expect(await printFormDraft(page, path)).toBe(secondPath);
    expect(await readFile(secondPath, "utf8")).toContain("%PDF-1.4");
    expect(await readFile(path, "utf8")).toContain("%PDF-1.4");
    expect(await printFormDraft(page, dir)).toBe(join(dir, "f572-2026-borrador.pdf"));
    expect(await printFormDraft(page, `${dir}/`)).toBe(join(dir, "f572-2026-borrador (1).pdf"));
    await page.route(`${base}generarBorradorPDF.do`, (route) =>
      route.fulfill({
        contentType: "application/octet-stream",
        headers: { "content-disposition": 'attachment; filename="error.pdf"' },
        body: "<html>Expired</html>",
      }),
    );
    const errorPath = join(dir, "error.pdf");
    await expect(printFormDraft(page, errorPath)).rejects.toThrow("no devolvió el PDF");
    await expect(stat(errorPath)).rejects.toThrow("ENOENT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
