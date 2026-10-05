import type { Page } from "playwright";
import type { DeductionDetailView, DeductionSummary } from "../types.js";
import { fetchSiradigJson, isRecord, parseInlineTable, type SiradigRequestClient } from "./http.js";
import { resolveReceiptTypeId } from "./receipt-types.js";

const DEDUCTIONS_MENU_URL = "verMenuDeducciones.do#header_deducciones";
const MEDICAL_EXPENSES_URL = "https://serviciosjava2.afip.gob.ar/radig/jsp/verGastosMedicos.do";

export async function readDeductions(
  page: Page,
  request: SiradigRequestClient = page.request,
): Promise<DeductionSummary[]> {
  const data = await fetchSiradigJson(
    request,
    "verMenuDeducciones.do",
    "datosDeduccionesAgrupadasJSON",
  );
  const deductions = parseDeductionsJson(data);
  if (deductions !== null) return deductions;
  await openDeductionsMenu(page);
  return listDeductions(page);
}

export function parseDeductionsJson(data: unknown): DeductionSummary[] | null {
  if (!Array.isArray(data)) return null;
  const deductions: DeductionSummary[] = [];
  for (const group of data) {
    if (!isRecord(group) || typeof group.linkAltaEdicion !== "string") return null;
    const rows = parseInlineTable(group.datosTabla);
    if (rows === null) return null;
    const type = deriveDeductionType(group.linkAltaEdicion);
    for (const row of rows) {
      const [cuit, name, period, amount] = row.cells;
      if (
        !row.id ||
        !cuit ||
        !name ||
        row.cells.length !== 4 ||
        !type ||
        period === undefined ||
        amount === undefined
      )
        return null;
      deductions.push({ type, id: row.id, cuit, name, period, amount });
    }
  }
  return deductions;
}

export async function openDeductionsMenu(page: Page): Promise<void> {
  await page.goto(new URL(DEDUCTIONS_MENU_URL, page.url()).href, { waitUntil: "domcontentloaded" });
}

export async function listDeductions(page: Page): Promise<DeductionSummary[]> {
  return (await listDeductionEntries(page)).map(({ editUrl: _editUrl, ...deduction }) => deduction);
}

export async function findDeductionById(
  page: Page,
  deductionId: string,
): Promise<(DeductionSummary & { editUrl: string }) | null> {
  const deductions = await listDeductionEntries(page);
  return deductions.find((deduction) => deduction.id === deductionId) ?? null;
}

export async function findDeductionByTypeAndCuit(
  page: Page,
  type: string,
  cuit: string,
): Promise<(DeductionSummary & { editUrl: string }) | null> {
  const deductions = await listDeductionsByTypeAndCuit(page, type, cuit);
  if (deductions.length > 1) {
    throw new Error(
      `Se encontró más de una deducción ${type} con CUIT ${cuit}. No puedo elegir una automáticamente.`,
    );
  }

  return deductions[0] ?? null;
}

export async function findDeductionByTypeCuitAndMonth(
  page: Page,
  type: string,
  cuit: string,
  month: number,
): Promise<(DeductionSummary & { editUrl: string }) | null> {
  const deductions = await listDeductionsByTypeAndCuit(page, type, cuit);
  return deductions.find((deduction) => parseMonthNumber(deduction.period) === month) ?? null;
}

async function findRequiredDeductionByTypeAndCuit(
  page: Page,
  type: string,
  cuit: string,
): Promise<DeductionSummary & { editUrl: string }> {
  const deduction = await findDeductionByTypeAndCuit(page, type, cuit);
  if (!deduction) {
    throw new Error(
      `No se encontró una deducción ${type} con CUIT ${cuit}. Revisá que el tipo y CUIT coincidan con arca-siradig form deductions list.`,
    );
  }

  return deduction;
}

async function listDeductionsByTypeAndCuit(
  page: Page,
  type: string,
  cuit: string,
): Promise<Array<DeductionSummary & { editUrl: string }>> {
  const deductions = await listDeductionEntries(page);
  return deductions.filter(
    (deduction) => deduction.type === type && normalizeCuit(deduction.cuit) === normalizeCuit(cuit),
  );
}

export async function openDeductionDetail(
  page: Page,
  editUrl: string,
  deductionId: string,
): Promise<void> {
  const baseUrl = page.url().startsWith("http")
    ? page.url()
    : "https://serviciosjava2.afip.gob.ar/radig/jsp/";
  const detailUrl = new URL(editUrl, baseUrl);
  detailUrl.searchParams.set("id", deductionId);
  await page.goto(detailUrl.href, { waitUntil: "domcontentloaded" });
}

export async function openDeductionDetailById(page: Page, deductionId: string): Promise<void> {
  await openDeductionDetail(page, "verCuotasMedicoAsistenciales.do", deductionId);
}

export async function extractDeductionDetail(page: Page): Promise<DeductionDetailView> {
  const heading =
    normalizeText(await readLocatorText(page.locator("fieldset legend").first())) || "Entidad";
  const cuit = normalizeText(await readLocatorInput(page, "#numeroDoc"));
  const name = normalizeText(await readLocatorInput(page, "#razonSocial"));
  const fromMonthValue = normalizeText(await readLocatorInput(page, "#mesDesde"));
  const toMonthValue = normalizeText(await readLocatorInput(page, "#mesHasta"));
  const fromMonthText = normalizeText(await readLocatorInput(page, "#mesDesdeTexto"));
  const toMonthText = normalizeText(await readLocatorInput(page, "#mesHastaTexto"));
  const amount = normalizeText(await readLocatorInput(page, "#montoTotal"));
  const monthlyRows = await readIndexedRows(page, "#tabla_meses");
  const receiptRows = await readIndexedRows(page, "#tabla_comprobantes");
  const hasMonthlyDetail = monthlyRows.length > 0;
  const receiptMonth = parseMonthNumber(fromMonthValue) || parseMonthNumber(fromMonthText);

  return {
    heading,
    cuit,
    name,
    fromMonth: parseMonthNumber(fromMonthValue) || parseMonthNumber(fromMonthText),
    fromMonthLabel: parseMonthLabel(fromMonthValue, fromMonthText),
    toMonth: parseMonthNumber(toMonthValue) || parseMonthNumber(toMonthText),
    toMonthLabel: parseMonthLabel(toMonthValue, toMonthText),
    amount: normalizeAmount(amount),
    monthlyDetail: monthlyRows.map((row) => ({
      month: parseMonthNumber(row.cells[0]),
      monthlyAmount: normalizeAmount(row.cells[1]),
      receiptsTotalAmount: normalizeAmount(row.cells[2]),
    })),
    receipts: receiptRows.map((row) =>
      hasMonthlyDetail
        ? {
            month: parseMonthNumber(row.cells[0]),
            date: normalizeDate(row.cells[1]),
            typeId: resolveReceiptTypeId(row.cells[2]) ?? row.cells[2],
            type: row.cells[2],
            id: row.rowId,
            amount: normalizeAmount(row.cells[4]),
          }
        : {
            month: receiptMonth,
            date: normalizeDate(row.cells[0]),
            typeId: resolveReceiptTypeId(row.cells[1]) ?? row.cells[1],
            type: row.cells[1],
            id: row.rowId,
            amount: normalizeAmount(row.cells[3]),
          },
    ),
  };
}

export async function addDeductionMonthlyItem(
  page: Page,
  options: { deductionType: string; cuit: string; month: number; amount: string },
): Promise<void> {
  await openDeductionsMenu(page);
  const deduction = await findRequiredDeductionByTypeAndCuit(
    page,
    options.deductionType,
    options.cuit,
  );
  await openDeductionDetail(page, deduction.editUrl, deduction.id);
  await addDeductionMonthlyItemOnOpenPage(page, options);
}

export async function addDeductionMonthlyItemOnOpenPage(
  page: Page,
  options: { month: number; amount: string },
): Promise<void> {
  const monthSelect = page.locator("#detalleIndividualMes");
  await page.locator("#btn_alta_mes").click();
  await expectVisible(page, "#dialog_alta_mes");

  const option = monthSelect.locator(`option[value="${options.month}"]`);
  if ((await option.count()) === 0) {
    throw new Error(`No se puede agregar el mes ${options.month}: el formulario no lo admite.`);
  }

  if (await option.isDisabled()) {
    throw new Error(
      `No se puede agregar el mes ${options.month} porque ya está agregado o es mayor al mes en curso.`,
    );
  }

  await monthSelect.selectOption(String(options.month));
  await page.locator("#detalleIndividualMontoMensual").fill(options.amount);
  await page.getByRole("button", { name: "Agregar" }).last().click();
  await page.locator("#btn_guardar").click();
}

export async function addDeductionReceiptItem(
  page: Page,
  options: {
    deductionType: string;
    cuit: string;
    month: number;
    date: string;
    receiptType: string;
    number: string;
    amount: string;
    reimbursedAmount?: string;
  },
): Promise<void> {
  if (options.deductionType === "gastos-medicos") {
    await addMedicalExpenseReceiptItem(page, {
      cuit: options.cuit,
      month: options.month,
      date: options.date,
      receiptType: options.receiptType,
      number: options.number,
      amount: options.amount,
      reimbursedAmount: readRequiredOption(options.reimbursedAmount, "--reimbursed-amount"),
    });
    return;
  }

  await openDeductionsMenu(page);
  const deduction = await findRequiredDeductionByTypeAndCuit(
    page,
    options.deductionType,
    options.cuit,
  );
  await openDeductionDetail(page, deduction.editUrl, deduction.id);
  await addDeductionReceiptItemOnOpenPage(page, {
    deductionType: options.deductionType,
    cuit: options.cuit,
    month: options.month,
    date: options.date,
    receiptType: options.receiptType,
    number: options.number,
    amount: options.amount,
  });
}

export async function addDeductionReceiptItemOnOpenPage(
  page: Page,
  options: {
    deductionType: string;
    cuit: string;
    month: number;
    date: string;
    receiptType: string;
    number: string;
    amount: string;
  },
): Promise<void> {
  const monthRow = page
    .locator(`#tabla_meses tbody tr[data-id-reg]`)
    .filter({
      hasText: formatMonthLabel(options.month),
    })
    .first();

  if ((await monthRow.count()) === 0) {
    throw new Error(
      `No se encontró el detalle mensual para el mes ${options.month}. Agregalo primero con arca-siradig form deductions add-item --period <YYYY> usando el mismo tipo, CUIT y mes.`,
    );
  }

  await monthRow.getByRole("link", { name: "Agregar Comprobante" }).click();
  await expectVisible(page, "#dialog_alta_comprobante");

  await fillReceiptDialog(page, options);
  await page.getByRole("button", { name: "Agregar" }).last().click();
  await page.locator("#btn_guardar").click();
}

export async function addMedicalExpenseReceiptItem(
  page: Page,
  options: {
    cuit: string;
    month: number;
    date: string;
    receiptType: string;
    number: string;
    amount: string;
    reimbursedAmount: string;
  },
): Promise<void> {
  await openDeductionsMenu(page);
  const existingDeduction = await findDeductionByTypeCuitAndMonth(
    page,
    "gastos-medicos",
    options.cuit,
    options.month,
  );

  if (existingDeduction) {
    await openDeductionDetail(page, existingDeduction.editUrl, existingDeduction.id);
  } else {
    await page.goto(MEDICAL_EXPENSES_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#numeroDoc").fill(normalizeCuit(options.cuit));
    await page.locator("#numeroDoc").dispatchEvent("change");
    await waitForMedicalProviderLookup(page);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  }

  await addMedicalExpenseReceiptItemOnOpenPage(page, options);
  await expectMedicalExpenseSaved(page, options);
}

export async function removeMedicalExpenseReceiptItem(
  page: Page,
  options: { cuit: string; number: string },
): Promise<void> {
  await openDeductionsMenu(page);
  const deductions = await listDeductionsByTypeAndCuit(page, "gastos-medicos", options.cuit);
  if (deductions.length === 0) {
    throw new Error(`No se encontró una deducción gastos-medicos con CUIT ${options.cuit}.`);
  }

  for (const deduction of deductions) {
    await openDeductionDetail(page, deduction.editUrl, deduction.id);
    if (await removeReceiptByNumberOnOpenPage(page, options.number)) {
      await page.locator("#btn_guardar").click();
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      return;
    }
  }

  throw new Error(`No se encontró un comprobante con número ${options.number}.`);
}

export async function addMedicalExpenseReceiptItemOnOpenPage(
  page: Page,
  options: {
    cuit: string;
    month: number;
    date: string;
    receiptType: string;
    number: string;
    amount: string;
    reimbursedAmount: string;
  },
): Promise<void> {
  await page.locator("#mesDesde").selectOption(String(options.month));
  await page.locator("#btn_alta_comprobante").click();
  await expectVisible(page, "#dialog_alta_comprobante");

  await fillReceiptDialog(page, options);
  await page.locator("#cmpMontoReintegrado").fill(options.reimbursedAmount);
  const addButton = page
    .locator(".ui-dialog")
    .filter({ has: page.locator("#dialog_alta_comprobante") })
    .getByRole("button", { name: "Agregar", exact: true });
  if ((await addButton.count()) > 0) {
    await addButton.click();
  } else {
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
  }
  await expectReceiptInTable(page, options.number);
  await ensureMedicalExpenseDeductibleAmount(page, options);
  await saveMedicalExpenseForm(page);
}

export async function removeReceiptByNumberOnOpenPage(
  page: Page,
  receiptNumber: string,
): Promise<boolean> {
  const targetNumber = normalizeReceiptNumberForComparison(receiptNumber);
  const rows = page.locator("#tabla_comprobantes tbody tr[data-id-reg]");

  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const cells = (await row.locator("td").allTextContents()).map(normalizeText);
    const rowNumber = normalizeReceiptNumberForComparison(cells[2] ?? "");
    if (rowNumber !== targetNumber) {
      continue;
    }

    const receiptId = normalizeText(await row.getAttribute("data-id-reg"));
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await row.locator(".eliminar span").click();
    await expectReceiptMarkedForDeletion(page, receiptId);
    return true;
  }

  return false;
}

async function expectReceiptMarkedForDeletion(page: Page, receiptId: string): Promise<void> {
  await waitForCondition(async () => {
    const value = await page
      .locator("#comprobantesEliminados")
      .inputValue()
      .catch(() => "");
    return value.split(";").includes(receiptId);
  });
}

async function fillReceiptDialog(
  page: Page,
  options: {
    date: string;
    receiptType: string;
    number: string;
    amount: string;
  },
): Promise<void> {
  const formattedDate = formatIsoDate(options.date);
  const receiptTypeId = resolveReceiptTypeId(options.receiptType) ?? options.receiptType;
  await page.locator("#cmpFechaEmision").fill(formattedDate);
  await page.locator("#cmpTipo").selectOption(receiptTypeId);

  if (receiptTypeId === "88") {
    await page
      .locator("#cmpNumeroAlternativo")
      .fill(normalizeReceiptAlternativeNumber(options.number));
  } else {
    const { pointOfSale, number } = normalizeReceiptNumber(options.number);
    await page.locator("#cmpPuntoVenta").fill(pointOfSale);
    await page.locator("#cmpNumero").fill(number);
  }

  await page.locator("#cmpMontoFacturado").fill(options.amount);
}

async function waitForMedicalProviderLookup(page: Page): Promise<void> {
  if ((await page.locator("#razonSocial").count()) === 0) {
    return;
  }

  await waitForCondition(async () => {
    const value = await page
      .locator("#razonSocial")
      .inputValue()
      .catch(() => "");
    return value.trim().length > 0;
  }).catch(() => undefined);
}

async function expectMedicalExpenseSaved(
  page: Page,
  options: { cuit: string; month: number; number: string },
): Promise<void> {
  const savedDeduction = await waitForMedicalExpenseDeduction(page, options);

  if (!savedDeduction) {
    throw new Error(
      `ARCA no confirmó el alta de gastos-medicos para CUIT ${options.cuit} en mes ${options.month}. Revisá si el portal mostró una validación en pantalla.`,
    );
  }

  await openDeductionDetail(page, savedDeduction.editUrl, savedDeduction.id);
  if (!(await hasReceiptNumber(page, options.number))) {
    throw new Error(
      `ARCA guardó la deducción de gastos-medicos para CUIT ${options.cuit} en mes ${options.month}, pero no encontré el comprobante ${options.number}.`,
    );
  }
}

async function saveMedicalExpenseForm(page: Page): Promise<void> {
  const saveResponse = page
    .waitForResponse((response) => response.url().includes("guardarGastosMedicos.do"), {
      timeout: 2_000,
    })
    .catch(() => null);
  await page.locator("#btn_guardar").click();
  await saveResponse;
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

async function waitForMedicalExpenseDeduction(
  page: Page,
  options: { cuit: string; month: number },
): Promise<(DeductionSummary & { editUrl: string }) | null> {
  let foundDeduction: (DeductionSummary & { editUrl: string }) | null = null;

  await waitForCondition(
    async () => {
      await openDeductionsMenu(page);
      foundDeduction = await findDeductionByTypeCuitAndMonth(
        page,
        "gastos-medicos",
        options.cuit,
        options.month,
      );
      return foundDeduction !== null;
    },
    { timeoutMs: 15_000, intervalMs: 750 },
  ).catch(() => undefined);

  return foundDeduction;
}

async function expectReceiptInTable(page: Page, receiptNumber: string): Promise<void> {
  await waitForCondition(() => hasReceiptNumber(page, receiptNumber));
}

async function hasReceiptNumber(page: Page, receiptNumber: string): Promise<boolean> {
  const targetNumber = normalizeReceiptNumberForComparison(receiptNumber);
  const rows = page.locator("#tabla_comprobantes tbody tr");

  for (let index = 0; index < (await rows.count()); index += 1) {
    const cells = (await rows.nth(index).locator("td").allTextContents()).map(normalizeText);
    if (normalizeReceiptNumberForComparison(cells[2] ?? "") === targetNumber) {
      return true;
    }
  }

  return false;
}

async function ensureMedicalExpenseDeductibleAmount(
  page: Page,
  options: { amount: string; reimbursedAmount: string },
): Promise<void> {
  const amountInput = page.locator("#montoTotal");
  if ((await amountInput.count()) === 0) {
    return;
  }

  const currentValue = normalizeText(await amountInput.inputValue().catch(() => ""));
  if (parseLocalizedAmount(currentValue) > 0) {
    return;
  }

  const deductibleAmount = await calculateMedicalExpenseDeductibleAmount(page, options);
  await amountInput.fill(formatLocalizedAmount(deductibleAmount), { force: true });
  await amountInput.dispatchEvent("change");
}

async function calculateMedicalExpenseDeductibleAmount(
  page: Page,
  options: { amount: string; reimbursedAmount: string },
): Promise<number> {
  const rows = page.locator("#tabla_comprobantes tbody tr");
  let netAmount = 0;

  for (let index = 0; index < (await rows.count()); index += 1) {
    const cells = (await rows.nth(index).locator("td").allTextContents()).map(normalizeText);
    const billedAmount = parseLocalizedAmount(cells[3] ?? "");
    const reimbursedAmount = parseLocalizedAmount(cells[4] ?? "");
    netAmount += Math.max(billedAmount - reimbursedAmount, 0);
  }

  if (netAmount <= 0) {
    netAmount =
      parseLocalizedAmount(options.amount) - parseLocalizedAmount(options.reimbursedAmount);
  }

  return Math.max(netAmount * 0.4, 0);
}

async function listDeductionEntries(
  page: Page,
): Promise<Array<DeductionSummary & { editUrl: string }>> {
  const tables = page.locator("#div_tabla_deducciones_agrupadas table.tablesorter");
  const deductions: Array<DeductionSummary & { editUrl: string }> = [];

  for (let tableIndex = 0; tableIndex < (await tables.count()); tableIndex += 1) {
    const table = tables.nth(tableIndex);
    const editUrl = normalizeText(await table.getAttribute("data-url-editar"));
    const type = deriveDeductionType(editUrl);
    const rows = table.locator("tbody tr[data-id-reg]");

    for (let rowIndex = 0; rowIndex < (await rows.count()); rowIndex += 1) {
      const row = rows.nth(rowIndex);
      if (!(await row.isVisible())) {
        continue;
      }

      const rowId = normalizeText(await row.getAttribute("data-id-reg"));
      const cells = await row.locator("td").allTextContents();
      const [cuit = "", name = "", period = "", amount = ""] = cells.map(normalizeText);

      if (!rowId || !type || !cuit || !name) {
        continue;
      }

      deductions.push({
        type,
        id: rowId,
        cuit,
        name,
        period,
        amount,
        editUrl,
      });
    }
  }

  return deductions;
}

function deriveDeductionType(editUrl: string | null): string {
  if (!editUrl) {
    return "unknown";
  }

  const normalizedUrl = editUrl.replace(/^.*\//, "");
  const urlToType: Record<string, string> = {
    "verCuotasMedicoAsistenciales.do": "cuotas-medico-asistenciales",
    "verPrimasAhorroSegMix.do": "primas-ahorro-seguro",
    "verPrimasSeguro.do": "primas-seguro",
    "verAportesSegRetiroPrivado.do": "aportes-seguro-retiro-privado",
    "verDonaciones.do": "donaciones",
    "verInteresesPrestamoHipotecario.do": "intereses-prestamo-hipotecario",
    "verGastosSepelio.do": "gastos-sepelio",
    "verGastosMedicos.do": "gastos-medicos",
    "verGastosInduEquip.do": "gastos-indumentaria-equipamiento",
    "verAlquilerInmuebleInquilinoN.do": "beneficio-alquiler-10",
    "verAlquilerInmuebleInquilinoO.do": "beneficio-alquiler-40",
    "verAlquilerInmueblePropietario.do": "beneficios-locadores-propietarios",
    "verPersonalDomestico.do": "deduccion-personal-domestico",
    "verAporteSociedad.do": "aporte-sociedad-garantia-reciproca",
    "verVehiculoCorredorViajanteComercio.do": "vehiculos-corredores-viajantes",
    "verGastosMVRICorredorViajanteComercio.do": "intereses-corredores-viajantes",
    "verGastosEducacion.do": "gastos-educacion",
    "verOtraDeduccion.do": "otras-deducciones",
    "verImpuestoCreditoDebito.do": "impuesto-creditos-debitos",
    "verImpuestoCreditoDebitoSinCBU.do": "impuesto-movimientos-fondos",
    "verPercepcionRetencionAduanera.do": "percepciones-retenciones-aduaneras",
    "verPagoCuentaB2.do": "pagos-cuenta-exterior-agencias",
    "verPagoCuentaC2.do": "pagos-cuenta-exterior-transporte",
    "verPagoCuentaRG4815A.do": "compra-moneda-extranjera",
    "verPagoCuentaRG4815B.do": "adquisicion-bienes-servicios-exterior",
    "verPagoCuentaRG4815C.do": "servicios-no-residentes",
    "verPagoCuentaRG4815D.do": "agencias-viajes-turismo",
    "verPagoCuentaRG4815E.do": "transporte-exterior",
    "verAutorretenciones.do": "autorretenciones",
    "verBeneficiosJubilados.do": "jubilados-pensionados-retirados",
    "verAjusteMontoRetroactivo.do": "ajuste-montos-retroactivos",
    "verAjusteAporteSociedad.do": "ajuste-aporte-sociedad",
  };

  if (urlToType[normalizedUrl]) {
    return urlToType[normalizedUrl];
  }

  return normalizeDeductionTypeFromUrl(normalizedUrl);
}

function normalizeDeductionTypeFromUrl(url: string): string {
  return url
    .replace(/^ver/, "")
    .replace(/\.do$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCuit(value: string): string {
  return normalizeText(value).replace(/\D/g, "");
}

function normalizeAmount(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized.includes(",")) {
    return normalized;
  }

  return normalized.replace(/\./g, "").replace(",", ".");
}

function parseLocalizedAmount(value: string): number {
  const normalized = normalizeAmount(value).replace(/[^\d.-]/g, "");
  return Number.parseFloat(normalized) || 0;
}

function formatLocalizedAmount(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function normalizeDate(value: string): string {
  const normalized = normalizeText(value);
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return normalized;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

async function readLocatorText(locator: ReturnType<Page["locator"]>): Promise<string> {
  return (await locator.textContent()) ?? "";
}

async function readLocatorInput(page: Page, selector: string): Promise<string> {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) {
    return "";
  }

  return await locator.inputValue().catch(() => "");
}

async function readIndexedRows(
  page: Page,
  selector: string,
): Promise<Array<{ rowId: string; cells: string[] }>> {
  const rows = page.locator(`${selector} tbody tr[data-id-reg]`);
  const items: Array<{ rowId: string; cells: string[] }> = [];

  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const rowId = normalizeText(await row.getAttribute("data-id-reg"));
    const cells = (await row.locator("td").allTextContents()).map(normalizeText);

    if (!rowId || cells.length < 5) {
      continue;
    }

    items.push({ rowId, cells });
  }

  return items;
}

function parseMonthNumber(value: string): number {
  const normalizedValue = normalizeText(value);
  const numericMatch = normalizedValue.match(/^(\d{1,2})(?:\s*-\s*.*)?$/);
  if (numericMatch) {
    return Number.parseInt(numericMatch[0], 10);
  }

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

  const monthIndex = monthNames.findIndex(
    (monthName) =>
      monthName.toLowerCase() === normalizedValue.toLowerCase() ||
      normalizedValue.toLowerCase().includes(`- ${monthName.toLowerCase()}`),
  );

  return monthIndex >= 0 ? monthIndex + 1 : 0;
}

function parseMonthLabel(numberValue: string, textValue: string): string {
  const normalizedText = normalizeText(textValue);
  if (normalizedText) {
    return normalizedText;
  }

  const monthNumber = parseMonthNumber(numberValue);
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

  return monthNames[monthNumber - 1] ?? "";
}

function formatMonthLabel(month: number): string {
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

  return `${String(month).padStart(2, "0")} - ${monthNames[month - 1] ?? String(month)}`;
}

function formatIsoDate(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`La fecha "${value}" debe tener formato YYYY-MM-DD.`);
  }

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function normalizeReceiptNumber(value: string): { pointOfSale: string; number: string } {
  const trimmedValue = value.trim();
  const compactMatch = trimmedValue.match(/^(\d{5})(\d{8})$/);
  if (compactMatch) {
    const [, pointOfSale, number] = compactMatch;
    return { pointOfSale, number };
  }

  const match = trimmedValue.match(/^(\d{1,5})-(\d{1,8})$/);
  if (!match) {
    throw new Error('El número de comprobante debe tener formato "12345-12345678" o 13 dígitos.');
  }

  const [, pointOfSale, number] = match;
  return {
    pointOfSale: pointOfSale.padStart(5, "0"),
    number: number.padStart(8, "0"),
  };
}

function normalizeReceiptAlternativeNumber(value: string): string {
  const normalized = value.trim();
  if (!/^\d{1,20}$/.test(normalized)) {
    throw new Error("El número alternativo del comprobante debe contener hasta 20 dígitos.");
  }

  return normalized;
}

function normalizeReceiptNumberForComparison(value: string): string {
  const normalized = normalizeText(value);
  if (/^\d{1,5}-\d{1,8}$/.test(normalized)) {
    const { pointOfSale, number } = normalizeReceiptNumber(normalized);
    return `${pointOfSale}${number}`;
  }

  return normalized.replace(/\D/g, "");
}

function readRequiredOption(value: string | undefined, optionName: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${optionName} is required.`);
  }

  return value.trim();
}

async function waitForCondition(
  predicate: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for ARCA page state.");
}

async function expectVisible(page: Page, selector: string): Promise<void> {
  await page.locator(selector).waitFor({ state: "visible" });
}
