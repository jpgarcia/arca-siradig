import type { Page } from "playwright";
import type { DataGroup, EmployeeSummary } from "../types.js";
import { fetchSiradigJson, parseInlineTable, type SiradigRequestClient } from "./http.js";
import { extractVisibleFieldsetData } from "./personal-data.js";

const EMPLOYEES_MENU_URL = "verMenuEmpleadores.do";

export async function readEmployees(
  page: Page,
  request: SiradigRequestClient = page.request,
): Promise<EmployeeSummary[]> {
  const data = await fetchSiradigJson(request, EMPLOYEES_MENU_URL, "datosEmpleadoresJSON");
  const employees = parseEmployeesJson(data);
  if (employees !== null) return employees;
  await openEmployeesMenu(page);
  return listEmployees(page);
}

export function parseEmployeesJson(data: unknown): EmployeeSummary[] | null {
  const rows = parseInlineTable(data);
  if (rows === null) return null;
  const employees: EmployeeSummary[] = [];
  for (const row of rows) {
    const [cuit, name, startDate, endDate, withholdingAgent] = row.cells;
    if (!row.id || !cuit || !name || row.cells.length !== 5) return null;
    employees.push({
      id: row.id,
      cuit,
      name,
      startDate: startDate || null,
      endDate: endDate || null,
      withholdingAgent: withholdingAgent || null,
    });
  }
  return employees;
}

export async function openEmployeesMenu(page: Page): Promise<void> {
  await page.goto(new URL(EMPLOYEES_MENU_URL, page.url()).href, { waitUntil: "domcontentloaded" });
}

export async function listEmployees(page: Page): Promise<EmployeeSummary[]> {
  const rows = page.locator("#nueva_tabla_empleadores tbody tr");
  const employees: EmployeeSummary[] = [];

  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    if (!(await row.isVisible())) {
      continue;
    }

    const cells = await row.locator("td").allTextContents();
    const [cuit = "", name = "", startDate = "", endDate = "", withholdingAgent = ""] =
      cells.map(normalizeText);
    const id = normalizeText(await row.getAttribute("data-id-reg"));

    if (!id || !cuit || !name) {
      continue;
    }

    employees.push({
      id,
      cuit,
      name,
      startDate: startDate || null,
      endDate: endDate || null,
      withholdingAgent: withholdingAgent || null,
    });
  }

  return employees;
}

export async function openEmployeeDetails(page: Page, employeeId: string): Promise<void> {
  await page.goto(
    new URL(`verEmpleador.do?id=${encodeURIComponent(employeeId)}`, page.url()).href,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page
    .waitForFunction(() => {
      const cuit = (document.querySelector("#cuit") as HTMLInputElement | null)?.value?.trim();
      const razonSocial = (
        document.querySelector("#razonSocial") as HTMLInputElement | null
      )?.value?.trim();

      return Boolean(cuit || razonSocial);
    })
    .catch(() => undefined);
}

export async function extractEmployeeData(page: Page): Promise<DataGroup[]> {
  return extractVisibleFieldsetData(page);
}

export function findEmployeeByCuit(
  employees: EmployeeSummary[],
  employeeCuit: string,
): EmployeeSummary | null {
  return employees.find((employee) => employee.cuit === employeeCuit) ?? null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
