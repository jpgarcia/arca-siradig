import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import {
  addDeductionMonthlyItem,
  addDeductionMonthlyItemOnOpenPage,
  addDeductionReceiptItem,
  addDeductionReceiptItemOnOpenPage,
  addMedicalExpenseReceiptItem,
  addMedicalExpenseReceiptItemOnOpenPage,
  extractDeductionDetail,
  findDeductionById,
  findDeductionByTypeAndCuit,
  listDeductions,
  openDeductionDetail,
  removeReceiptByNumberOnOpenPage,
} from "../src/arca/deductions.js";
import {
  extractEmployeeData,
  findEmployeeByCuit,
  listEmployees,
  openEmployeeDetails,
} from "../src/arca/employees.js";
import { listMenuItems, returnToMainMenu, selectMenuItem } from "../src/arca/menu.js";
import { extractPersonalData } from "../src/arca/personal-data.js";
import {
  acceptReminderModalIfPresent,
  listPersons,
  selectPerson,
  waitForPersonSelection,
} from "../src/arca/persons.js";
import { listReceiptTypes, resolveReceiptTypeId } from "../src/arca/receipt-types.js";
import {
  ArcaLoginError,
  loginToArca,
  openSiradigFromPortal,
  SIRADIG_LOGIN_URL,
} from "../src/arca/session.js";
import { parseCliOptions } from "../src/cli/options.js";
import {
  printDeductionDetail,
  printDeductions,
  printEmployeeData,
  printEmployees,
  printReceiptTypes,
} from "../src/cli/render.js";
import {
  toStructuredDeductionDetail,
  toStructuredEmployeeData,
  toStructuredPersonalData,
} from "../src/cli/structured-output.js";
import { createSessionStore } from "../src/session/store.js";

// All names, identifiers, addresses and amounts below are synthetic examples.

test("parses headless CLI options", () => {
  expect(parseCliOptions([])).toEqual({ kind: "help", headless: true, topic: "root" });
  expect(parseCliOptions(["--help"])).toEqual({ kind: "help", headless: true, topic: "root" });
  expect(parseCliOptions(["-h"])).toEqual({ kind: "help", headless: true, topic: "root" });
  expect(parseCliOptions(["--interactive"])).toEqual({ kind: "interactive", headless: true });
  expect(parseCliOptions(["-i", "--headless", "false"])).toEqual({
    kind: "interactive",
    headless: false,
  });
});

test("parses command CLI options", () => {
  expect(parseCliOptions(["login", "--cuit", "20000000001", "--password", "secret"])).toEqual({
    kind: "login",
    headless: true,
    cuit: "20000000001",
    password: "secret",
    hasExplicitCredentials: true,
  });
  expect(() => parseCliOptions(["login", "-c", "20000000001", "-p", "secret"])).toThrow(
    "Unknown option: -c",
  );
  expect(parseCliOptions(["login", "--help"])).toEqual({
    kind: "help",
    headless: true,
    topic: "login",
  });
  expect(parseCliOptions(["persons", "list"])).toEqual({
    kind: "persons-list",
    headless: true,
    format: "text",
  });
  expect(parseCliOptions(["persons", "select", "10011"])).toEqual({
    kind: "persons-select",
    headless: true,
    person: "10011",
  });
  expect(parseCliOptions(["persons", "select"])).toEqual({
    kind: "help",
    headless: true,
    topic: "persons",
  });
  expect(parseCliOptions(["logout"])).toEqual({
    kind: "logout",
  });
  expect(parseCliOptions(["logout", "--help"])).toEqual({
    kind: "help",
    headless: true,
    topic: "logout",
  });
  expect(parseCliOptions(["persons", "list", "--format=json"])).toEqual({
    kind: "persons-list",
    headless: true,
    format: "json",
  });
  expect(parseCliOptions(["personal-data", "show", "--person", "SAMPLE PERSON"])).toEqual({
    kind: "persons-personal-data-show",
    headless: true,
    person: "SAMPLE PERSON",
    format: "text",
  });
  expect(parseCliOptions(["employees", "list", "--person=SAMPLE PERSON"])).toEqual({
    kind: "persons-employees-list",
    headless: true,
    person: "SAMPLE PERSON",
    format: "text",
  });
  expect(parseCliOptions(["form", "deductions", "list", "--person", "SAMPLE PERSON"])).toEqual({
    kind: "form-deductions-list",
    headless: true,
    person: "SAMPLE PERSON",
    format: "text",
  });
  expect(parseCliOptions(["form", "deductions", "list"])).toEqual({
    kind: "form-deductions-list",
    headless: true,
    person: undefined,
    format: "text",
  });
  expect(parseCliOptions(["form", "deductions", "list-receipt-types"])).toEqual({
    kind: "form-deductions-list-receipt-types",
    headless: true,
    format: "text",
  });
  expect(parseCliOptions(["form", "deductions", "show", "10003"])).toEqual({
    kind: "form-deductions-show",
    headless: true,
    person: undefined,
    deductionId: "10003",
    format: "text",
  });
  expect(parseCliOptions(["form", "deductions", "show", "10003", "--format=json"])).toEqual({
    kind: "form-deductions-show",
    headless: true,
    person: undefined,
    deductionId: "10003",
    format: "json",
  });
  expect(
    parseCliOptions([
      "form",
      "deductions",
      "add-item",
      "--period=2026",
      "--type",
      "cuotas-medico-asistenciales",
      "--cuit",
      "30000000003",
      "--month",
      "3",
      "--amount",
      "1234.12",
    ]),
  ).toEqual({
    kind: "form-deductions-add-item",
    period: 2026,
    headless: true,
    deductionType: "cuotas-medico-asistenciales",
    cuit: "30000000003",
    month: 3,
    amount: "1234.12",
  });
  expect(
    parseCliOptions([
      "form",
      "deductions",
      "add-item-receipt",
      "--period=2026",
      "--type",
      "cuotas-medico-asistenciales",
      "--cuit",
      "30000000003",
      "--month",
      "3",
      "--date",
      "2026-03-10",
      "--receipt-type",
      "6",
      "--number",
      "0001-00000001",
      "--amount",
      "1234.12",
    ]),
  ).toEqual({
    kind: "form-deductions-add-item-receipt",
    period: 2026,
    headless: true,
    deductionType: "cuotas-medico-asistenciales",
    cuit: "30000000003",
    month: 3,
    date: "2026-03-10",
    receiptType: "6",
    number: "0001-00000001",
    amount: "1234.12",
  });
  expect(
    parseCliOptions([
      "form",
      "deductions",
      "add-item-receipt",
      "--period=2026",
      "--type=gastos-medicos",
      "--cuit=30000000004",
      "--month=5",
      "--date=2026-05-22",
      "--receipt-type=6",
      "--number=0000300000222",
      "--amount=100",
      "--reimbursed-amount=0",
    ]),
  ).toEqual({
    kind: "form-deductions-add-item-receipt",
    period: 2026,
    headless: true,
    deductionType: "gastos-medicos",
    cuit: "30000000004",
    month: 5,
    date: "2026-05-22",
    receiptType: "6",
    number: "0000300000222",
    amount: "100",
    reimbursedAmount: "0",
  });
  expect(() =>
    parseCliOptions([
      "form",
      "deductions",
      "add-item-receipt",
      "--period=2026",
      "--type=gastos-medicos",
      "--month=5",
      "--date=2026-05-22",
      "--receipt-type=6",
      "--number=0000300000222",
      "--amount=100",
      "--reimbursed-amount=0",
    ]),
  ).toThrow("--cuit is required.");
  expect(() =>
    parseCliOptions([
      "form",
      "deductions",
      "add-item-receipt",
      "--period=2026",
      "--type=gastos-medicos",
      "--cuit=30000000004",
      "--month=5",
      "--date=2026-05-22",
      "--receipt-type=6",
      "--number=0000300000222",
      "--amount=100",
    ]),
  ).toThrow("--reimbursed-amount is required.");
  expect(() =>
    parseCliOptions([
      "form",
      "deductions",
      "add-item",
      "--period=2026",
      "--deduction-id",
      "10004",
      "--month",
      "3",
      "--amount",
      "1234.12",
    ]),
  ).toThrow("Unknown option: --deduction-id");
  expect(() =>
    parseCliOptions([
      "form",
      "deductions",
      "add-item",
      "--period=2026",
      "--cuit=30000000003",
      "--month=3",
      "--amount=1234.12",
    ]),
  ).toThrow("--type is required.");
  expect(() =>
    parseCliOptions([
      "form",
      "deductions",
      "add-item-receipt",
      "--period=2026",
      "--type=cuotas-medico-asistenciales",
      "--month=3",
      "--date=2026-03-10",
      "--receipt-type=6",
      "--number=0001-00000001",
      "--amount=1234.12",
    ]),
  ).toThrow("--cuit is required.");
  expect(
    parseCliOptions([
      "form",
      "deductions",
      "remove-item-receipt",
      "--period=2026",
      "--cuit=30000000004",
      "--number=0000300000428",
    ]),
  ).toEqual({
    kind: "form-deductions-remove-item-receipt",
    period: 2026,
    headless: true,
    deductionType: "gastos-medicos",
    cuit: "30000000004",
    number: "0000300000428",
  });
  expect(
    parseCliOptions([
      "employees",
      "show",
      "--person",
      "SAMPLE PERSON",
      "--employee-cuit",
      "30000000005",
      "--format=json",
    ]),
  ).toEqual({
    kind: "persons-employees-show",
    headless: true,
    person: "SAMPLE PERSON",
    employeeCuit: "30000000005",
    format: "json",
  });
  expect(() => parseCliOptions(["persons", "list", "--format=xml"])).toThrow(
    '--format expects "text" or "json".',
  );
  expect(parseCliOptions(["personal-data", "show"])).toEqual({
    kind: "persons-personal-data-show",
    headless: true,
    person: undefined,
    format: "text",
  });
  expect(() => parseCliOptions(["employees", "show", "--person", "SAMPLE PERSON"])).toThrow(
    "--employee-cuit is required.",
  );
  expect(parseCliOptions(["form", "deductions"])).toEqual({
    kind: "help",
    headless: true,
    topic: "deductions",
  });
  expect(parseCliOptions(["form", "deductions", "--help"])).toEqual({
    kind: "help",
    headless: true,
    topic: "deductions",
  });
  expect(parseCliOptions(["persons"])).toEqual({ kind: "help", headless: true, topic: "persons" });
  expect(parseCliOptions(["personal-data"])).toEqual({
    kind: "help",
    headless: true,
    topic: "personal-data",
  });
  expect(parseCliOptions(["employees"])).toEqual({
    kind: "help",
    headless: true,
    topic: "employees",
  });
  expect(parseCliOptions(["employees", "--help"])).toEqual({
    kind: "help",
    headless: true,
    topic: "employees",
  });
  expect(() => parseCliOptions(["unknown"])).toThrow("Unknown command: unknown");
});

test("stores and reads a session without a password", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "arca-siradig-test-"));
  const store = createSessionStore(baseDir);

  try {
    await expect(store.read()).resolves.toBeNull();
    await store.write({
      cuit: "20000000001",
      createdAt: "2026-06-15T00:00:00.000Z",
      storageState: {
        cookies: [
          {
            name: "SESSION_TOKEN",
            value: "opaque",
            domain: ".serviciosjava2.afip.gob.ar",
            path: "/radig",
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
    });

    const storedSession = await store.read();
    expect(storedSession?.cuit).toBe("20000000001");
    expect(JSON.stringify(storedSession)).not.toContain("password");

    await store.clear();
    await expect(store.read()).resolves.toBeNull();
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("maps personal data groups to structured JSON output", () => {
  expect(
    toStructuredPersonalData([
      {
        title: "Apellido y Nombre",
        fields: [
          { label: "Apellido", value: "APELLIDO EJEMPLO" },
          { label: "Nombre", value: "NOMBRE EJEMPLO" },
        ],
      },
      {
        title: "Domicilio",
        fields: [
          { label: "Calle", value: "CALLE EJEMPLO" },
          { label: "Nro.", value: "123 1 B" },
          { label: "Provincia", value: "Ciudad de Buenos Aires" },
          { label: "Código Postal", value: "1000" },
        ],
      },
    ]),
  ).toEqual([
    {
      lastName: "APELLIDO EJEMPLO",
      firstName: "NOMBRE EJEMPLO",
      street: "CALLE EJEMPLO",
      streetNumber: "123 1 B",
      province: "Ciudad de Buenos Aires",
      zipCode: "1000",
    },
  ]);
});

test("maps employee data groups to structured JSON output", () => {
  expect(
    toStructuredEmployeeData([
      {
        title: "Empleador",
        fields: [
          { label: "CUIT del Empleador", value: "30000000005" },
          { label: "Razón Social o Apellido y Nombre", value: "EMPLEADOR EJEMPLO S.R.L." },
        ],
      },
      {
        title: "Relación Laboral",
        fields: [
          { label: "Fecha de Inicio de Relación", value: "01/01/2024" },
          { label: "¿Es su agente de retención?", value: "Sí" },
        ],
      },
    ]),
  ).toEqual([
    {
      cuit: "30000000005",
      name: "EMPLEADOR EJEMPLO S.R.L.",
      startDate: "2024-01-01",
      retentionAgent: true,
    },
  ]);
});

test("prints employee data without repeating the heading", () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""));
  };

  try {
    printEmployeeData([
      {
        title: "Empleador",
        fields: [
          { label: "CUIT del Empleador", value: "30000000005" },
          { label: "Razón Social o Apellido y Nombre", value: "EMPLEADOR EJEMPLO S.R.L." },
        ],
      },
      {
        title: "Relación Laboral",
        fields: [
          { label: "Fecha de Inicio de Relación", value: "01/01/2024" },
          { label: "¿Es su agente de retención?", value: "Sí" },
        ],
      },
    ]);
  } finally {
    console.log = originalLog;
  }

  expect(lines).toEqual([
    "\nEmpleador",
    "- CUIT del Empleador: 30000000005",
    "- Razón Social o Apellido y Nombre: EMPLEADOR EJEMPLO S.R.L.",
    "\nRelación Laboral",
    "- Fecha de Inicio de Relación: 01/01/2024",
    "- ¿Es su agente de retención?: Sí",
  ]);
});

test("prints employees as labeled fields", () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""));
  };

  try {
    printEmployees([
      {
        id: "10011",
        cuit: "30000000005",
        name: "EMPLEADOR EJEMPLO S.R.L.",
        startDate: "01/01/2024",
        endDate: null,
        withholdingAgent: "Sí",
      },
    ]);
  } finally {
    console.log = originalLog;
  }

  expect(lines).toEqual([
    "\nEmpleadores",
    "CUIT: 30000000005",
    "Razón Social / Apellido y Nombre: EMPLEADOR EJEMPLO S.R.L.",
    "Fecha Inicio: 01/01/2024",
    "Fecha Fin: ",
    "Agente de Retención: Sí",
  ]);
});

test("prints deductions as labeled fields", () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""));
  };

  try {
    printDeductions([
      {
        type: "cuotas-medico-asistenciales",
        id: "10004",
        cuit: "30000000003",
        name: "COBERTURA MEDICA EJEMPLO",
        period: "Enero - Febrero",
        amount: "1200.00",
      },
    ]);
  } finally {
    console.log = originalLog;
  }

  expect(lines).toEqual([
    "\nDeducciones y desgravaciones",
    "Type: cuotas-medico-asistenciales",
    "ID: 10004",
    "CUIT: 30000000003",
    "Denominación: COBERTURA MEDICA EJEMPLO",
    "Período: Enero - Febrero",
    "Importe: 1200.00",
  ]);
});

test("lists receipt types as a table", () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""));
  };

  try {
    printReceiptTypes(listReceiptTypes());
  } finally {
    console.log = originalLog;
  }

  expect(lines).toEqual([
    "ID      Tipo",
    "6       Factura B",
    "7       Nota de Débito B",
    "8       Nota de Crédito B",
    "9       Recibo B",
    "10      Nota de Venta al contado B",
    "11      Factura C",
    "12      Nota de Débito C",
    "13      Nota de Crédito C",
    "14      Documento Aduanero",
    "15      Recibo C",
    "16      Nota de Venta al contado C",
    "40      Otro comprobante B (RG 1415)",
    "41      Otro comprobante C (RG 1415)",
    "82      Tique-factura B",
    "88      Otros comp. doc. exceptuados",
  ]);
});

test("resolves receipt type ids from labels", () => {
  expect(resolveReceiptTypeId("Factura B")).toBe("6");
  expect(resolveReceiptTypeId("Otros comprobantes documentos exceptuados")).toBe("88");
  expect(resolveReceiptTypeId("unknown")).toBeNull();
});

test("prints deduction details as labeled fields", () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""));
  };

  try {
    printDeductionDetail({
      heading: "Entidad",
      cuit: "30000000002",
      name: "ASEGURADORA EJEMPLO S.A.",
      fromMonth: 1,
      fromMonthLabel: "Enero",
      toMonth: 3,
      toMonthLabel: "Marzo",
      amount: "4600,75",
      monthlyDetail: [
        {
          month: 1,
          monthlyAmount: "1500.25",
          receiptsTotalAmount: "1500.25",
        },
      ],
      receipts: [
        {
          month: 1,
          date: "2026-01-13",
          typeId: "88",
          type: "Otros comprobantes documentos exceptuados",
          id: "10007",
          amount: "1500.25",
        },
      ],
    });
  } finally {
    console.log = originalLog;
  }

  expect(lines).toEqual([
    "\nEntidad",
    "CUIT: 30000000002",
    "Razón Social: ASEGURADORA EJEMPLO S.A.",
    "",
    "Período",
    "-------",
    "Mes Desde: Enero",
    "Mes Hasta: Marzo",
    "",
    "Monto",
    "-----",
    "Monto Total: 4600,75",
    "",
    "Detalle Mensual",
    "---------------",
    "Mes: Enero",
    "Monto Mensual: 1500.25",
    "Monto Comprobantes Ingresados: 1500.25",
    "",
    "Comprobantes",
    "------------",
    "Mes: Enero",
    "Fecha: 2026-01-13",
    "Tipo: Otros comprobantes documentos exceptuados",
    "ID: 10007",
    "Monto: 1500.25",
    "",
  ]);
});

test("prints single-period medical expense details with deductible amount", () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""));
  };

  try {
    printDeductionDetail({
      heading: "Prestador del Servicio Médico / Paramédico",
      cuit: "30000000004",
      name: "CLINICA EJEMPLO S.A.",
      fromMonth: 5,
      fromMonthLabel: "Mayo",
      toMonth: 0,
      toMonthLabel: "",
      amount: "2500.00",
      monthlyDetail: [],
      receipts: [
        {
          month: 5,
          date: "2026-05-08",
          typeId: "6",
          type: "Factura B",
          id: "10010",
          amount: "1000.00",
        },
      ],
    });
  } finally {
    console.log = originalLog;
  }

  expect(lines).toEqual([
    "\nPrestador del Servicio Médico / Paramédico",
    "CUIT: 30000000004",
    "Razón Social: CLINICA EJEMPLO S.A.",
    "",
    "Período y Monto",
    "---------------",
    "Período: Mayo",
    "Monto Deducible: 2500.00",
    "",
    "Comprobantes",
    "------------",
    "Mes: Mayo",
    "Fecha: 2026-05-08",
    "Tipo: Factura B",
    "ID: 10010",
    "Monto: 1000.00",
    "",
  ]);
});

test("extracts deduction details from the detail page", async ({ page }) => {
  await page.setContent(`
    <div id="contenido">
      <fieldset>
        <legend>Entidad</legend>
        <table class="formulario">
          <tr>
            <th>CUIT</th>
            <td><input id="numeroDoc" value="30000000002" /></td>
          </tr>
          <tr>
            <th>Razón Social</th>
            <td><input id="razonSocial" value="ASEGURADORA EJEMPLO S.A." /></td>
          </tr>
        </table>
      </fieldset>
      <fieldset>
        <legend>Período</legend>
        <table class="formulario">
          <tr>
            <th>Mes Desde</th>
            <td><input id="mesDesde" value="1" /><input id="mesDesdeTexto" value="Enero" /></td>
          </tr>
          <tr>
            <th>Mes Hasta</th>
            <td><input id="mesHasta" value="3" /><input id="mesHastaTexto" value="Marzo" /></td>
          </tr>
        </table>
      </fieldset>
      <fieldset>
        <legend>Monto</legend>
        <table class="formulario">
          <tr>
            <th>Monto Total</th>
            <td><input id="montoTotal" value="4600,75" /></td>
          </tr>
        </table>
      </fieldset>
      <table id="tabla_meses">
        <tbody>
          <tr data-id-reg="10005">
            <td>01 - Enero</td>
            <td>1500.25</td>
            <td>1500.25</td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <table id="tabla_comprobantes">
        <tbody>
          <tr data-id-reg="10007">
            <td>01 - Enero</td>
            <td>13/01/2026</td>
            <td>Otros comprobantes documentos exceptuados</td>
            <td>10001</td>
            <td>1500.25</td>
          </tr>
        </tbody>
      </table>
    </div>
  `);

  const deductionDetail = await extractDeductionDetail(page);

  expect(deductionDetail).toEqual({
    heading: "Entidad",
    cuit: "30000000002",
    name: "ASEGURADORA EJEMPLO S.A.",
    fromMonth: 1,
    fromMonthLabel: "Enero",
    toMonth: 3,
    toMonthLabel: "Marzo",
    amount: "4600.75",
    monthlyDetail: [
      {
        month: 1,
        monthlyAmount: "1500.25",
        receiptsTotalAmount: "1500.25",
      },
    ],
    receipts: [
      {
        month: 1,
        date: "2026-01-13",
        typeId: "88",
        type: "Otros comprobantes documentos exceptuados",
        id: "10007",
        amount: "1500.25",
      },
    ],
  });

  expect(toStructuredDeductionDetail(deductionDetail)).toEqual({
    cuit: "30000000002",
    name: "ASEGURADORA EJEMPLO S.A.",
    fromMonth: 1,
    toMonth: 3,
    amount: "4600.75",
    monthlyDetail: [
      {
        month: 1,
        monthlyAmount: "1500.25",
        receiptsTotalAmount: "1500.25",
      },
    ],
    receipts: [
      {
        month: 1,
        date: "2026-01-13",
        type: "88",
        id: "10007",
        amount: "1500.25",
      },
    ],
  });
});

test("extracts medical expense receipt columns without monthly detail", async ({ page }) => {
  await page.setContent(`
    <div id="contenido">
      <fieldset>
        <legend>Entidad</legend>
        <table class="formulario">
          <tr>
            <th>CUIT</th>
            <td><input id="numeroDoc" value="30000000004" /></td>
          </tr>
          <tr>
            <th>Razón Social</th>
            <td><input id="razonSocial" value="CLINICA EJEMPLO S.A." /></td>
          </tr>
        </table>
      </fieldset>
      <fieldset>
        <legend>Período</legend>
        <table class="formulario">
          <tr>
            <th>Mes</th>
            <td><input id="mesDesde" value="6" /></td>
          </tr>
        </table>
      </fieldset>
      <fieldset>
        <legend>Monto</legend>
        <table class="formulario">
          <tr>
            <th>Monto Deducible</th>
            <td><input id="montoTotal" value="400,00" /></td>
          </tr>
        </table>
      </fieldset>
      <table id="tabla_comprobantes">
        <tbody>
          <tr data-id-reg="10009">
            <td>11/06/2026</td>
            <td>Factura B</td>
            <td>00003 - 00000428</td>
            <td>1000.00</td>
            <td>0.00</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `);

  await expect(extractDeductionDetail(page)).resolves.toEqual({
    heading: "Entidad",
    cuit: "30000000004",
    name: "CLINICA EJEMPLO S.A.",
    fromMonth: 6,
    fromMonthLabel: "Junio",
    toMonth: 0,
    toMonthLabel: "",
    amount: "400.00",
    monthlyDetail: [],
    receipts: [
      {
        month: 6,
        date: "2026-06-11",
        typeId: "6",
        type: "Factura B",
        id: "10009",
        amount: "1000.00",
      },
    ],
  });
});

test("adds a monthly deduction item from the detail page markup", async ({ page }) => {
  await page.setContent(`
    <button id="btn_alta_mes">Agregar Mes Individual</button>
    <div id="dialog_alta_mes" style="display:none;">
      <select id="detalleIndividualMes">
        <option value="1">Enero</option>
        <option value="2" disabled>Febrero</option>
        <option value="3">Marzo</option>
      </select>
      <input id="detalleIndividualMontoMensual" />
    </div>
    <button id="btn_guardar">Guardar</button>
  `);

  await page.locator("#btn_alta_mes").evaluate((button) => {
    button.addEventListener("click", () => {
      const dialog = document.querySelector("#dialog_alta_mes") as HTMLElement;
      dialog.style.display = "block";
    });
  });
  await page.locator("#btn_guardar").evaluate((button) => {
    button.addEventListener("click", () => {
      (window as Window & { clickedSave?: boolean }).clickedSave = true;
    });
  });

  await expect(
    addDeductionMonthlyItemOnOpenPage(page, { month: 3, amount: "1234.12" }),
  ).resolves.toBeUndefined();

  await expect(page.locator("#detalleIndividualMontoMensual")).toHaveValue("1234.12");
});

test("adds a receipt item using the correct modal fields", async ({ page }) => {
  await page.setContent(`
    <table id="tabla_meses">
      <tbody>
        <tr data-id-reg="10006">
          <td>01 - Enero</td>
          <td>1100.00</td>
          <td>1100.00</td>
          <td><a href="#" class="agregar-comprobantes">Agregar Comprobante</a></td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div id="dialog_alta_comprobante" style="display:none;">
      <input id="cmpFechaEmision" />
      <select id="cmpTipo">
        <option value="6">Factura B</option>
        <option value="88">Otros comp. doc. exceptuados</option>
      </select>
      <div id="cmpDivPuntoVentaNumero"><input id="cmpPuntoVenta" /><input id="cmpNumero" /></div>
      <div id="cmpDivNumeroAlternativo" style="display:none;"><input id="cmpNumeroAlternativo" /></div>
      <input id="cmpMontoFacturado" />
      <button type="button">Agregar</button>
      <button type="button">Cancelar</button>
    </div>
    <button id="btn_guardar">Guardar</button>
  `);

  await page.locator("a.agregar-comprobantes").evaluate((link) => {
    link.addEventListener("click", () => {
      const dialog = document.querySelector("#dialog_alta_comprobante") as HTMLElement;
      dialog.style.display = "block";
    });
  });
  await page.locator("#cmpTipo").evaluate((select) => {
    select.addEventListener("change", () => {
      const alt = document.querySelector("#cmpDivNumeroAlternativo") as HTMLElement;
      const pair = document.querySelector("#cmpDivPuntoVentaNumero") as HTMLElement;
      if ((select as HTMLSelectElement).value === "88") {
        alt.style.display = "block";
        pair.style.display = "none";
      } else {
        alt.style.display = "none";
        pair.style.display = "block";
      }
    });
  });

  await expect(
    addDeductionReceiptItemOnOpenPage(page, {
      deductionType: "cuotas-medico-asistenciales",
      cuit: "30000000003",
      month: 1,
      date: "2026-01-21",
      receiptType: "6",
      number: "0001-00000001",
      amount: "1100.00",
    }),
  ).resolves.toBeUndefined();

  await expect(page.locator("#cmpFechaEmision")).toHaveValue("21/01/2026");
  await expect(page.locator("#cmpPuntoVenta")).toHaveValue("00001");
  await expect(page.locator("#cmpNumero")).toHaveValue("00000001");
  await expect(page.locator("#cmpMontoFacturado")).toHaveValue("1100.00");
});

test("formats receipt alternative number for type 88", async ({ page }) => {
  await page.setContent(`
    <table id="tabla_meses">
      <tbody>
        <tr data-id-reg="10006">
          <td>01 - Enero</td>
          <td>1100.00</td>
          <td>1100.00</td>
          <td><a href="#" class="agregar-comprobantes">Agregar Comprobante</a></td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div id="dialog_alta_comprobante" style="display:none;">
      <input id="cmpFechaEmision" />
      <select id="cmpTipo">
        <option value="88">Otros comp. doc. exceptuados</option>
      </select>
      <div id="cmpDivPuntoVentaNumero"><input id="cmpPuntoVenta" /><input id="cmpNumero" /></div>
      <div id="cmpDivNumeroAlternativo" style="display:none;"><input id="cmpNumeroAlternativo" /></div>
      <input id="cmpMontoFacturado" />
      <button type="button">Agregar</button>
      <button type="button">Cancelar</button>
    </div>
    <button id="btn_guardar">Guardar</button>
  `);

  await page.locator("a.agregar-comprobantes").evaluate((link) => {
    link.addEventListener("click", () => {
      const dialog = document.querySelector("#dialog_alta_comprobante") as HTMLElement;
      dialog.style.display = "block";
    });
  });
  await page.locator("#cmpTipo").evaluate((select) => {
    select.addEventListener("change", () => {
      const alt = document.querySelector("#cmpDivNumeroAlternativo") as HTMLElement;
      const pair = document.querySelector("#cmpDivPuntoVentaNumero") as HTMLElement;
      if ((select as HTMLSelectElement).value === "88") {
        alt.style.display = "block";
        pair.style.display = "none";
      } else {
        alt.style.display = "none";
        pair.style.display = "block";
      }
    });
  });

  await expect(
    addDeductionReceiptItemOnOpenPage(page, {
      deductionType: "cuotas-medico-asistenciales",
      cuit: "30000000003",
      month: 1,
      date: "2026-01-21",
      receiptType: "88",
      number: "1",
      amount: "1100.00",
    }),
  ).resolves.toBeUndefined();

  await expect(page.locator("#cmpNumeroAlternativo")).toHaveValue("1");
});

test("finds gastos medicos deductions by type and CUIT", async ({ page }) => {
  await page.setContent(`
    <div id="div_tabla_deducciones_agrupadas">
      <table class="ui-widget ui-widget-content tablesorter tabla_retgan" data-url-editar="verGastosMedicos.do">
        <tbody>
          <tr data-id-reg="123">
            <td>30-00000000-4</td>
            <td>PRESTADOR MEDICO</td>
            <td>Mayo</td>
            <td>100.00</td>
          </tr>
        </tbody>
      </table>
    </div>
  `);

  await expect(findDeductionByTypeAndCuit(page, "gastos-medicos", "30000000004")).resolves.toEqual({
    type: "gastos-medicos",
    id: "123",
    cuit: "30-00000000-4",
    name: "PRESTADOR MEDICO",
    period: "Mayo",
    amount: "100.00",
    editUrl: "verGastosMedicos.do",
  });
});

test("adds a monthly deduction item by type and CUIT", async ({ page }) => {
  const visitedUrls: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    visitedUrls.push(url);

    if (url.includes("verMenuDeducciones.do")) {
      await route.fulfill({
        contentType: "text/html",
        body: `
          <div id="div_tabla_deducciones_agrupadas">
            <table class="tablesorter" data-url-editar="verCuotasMedicoAsistenciales.do">
              <tbody>
                <tr data-id-reg="10004">
                  <td>30000000003</td>
                  <td>COBERTURA EJEMPLO</td>
                  <td>Enero - Febrero</td>
                  <td>1200.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        `,
      });
      return;
    }

    await route.fulfill({
      contentType: "text/html",
      body: `
        <button id="btn_alta_mes">Agregar Mes Individual</button>
        <div id="dialog_alta_mes" style="display:none;">
          <select id="detalleIndividualMes"><option value="3">Marzo</option></select>
          <input id="detalleIndividualMontoMensual" />
        </div>
        <button id="btn_guardar">Guardar</button>
        <script>
          document.querySelector("#btn_alta_mes").addEventListener("click", () => {
            document.querySelector("#dialog_alta_mes").style.display = "block";
          });
        </script>
      `,
    });
  });

  await page.goto("https://serviciosjava2.afip.gob.ar/radig/jsp/start.do");
  await addDeductionMonthlyItem(page, {
    deductionType: "cuotas-medico-asistenciales",
    cuit: "30000000003",
    month: 3,
    amount: "1234",
  });

  expect(visitedUrls.some((url) => url.includes("verCuotasMedicoAsistenciales.do?id=10004"))).toBe(
    true,
  );
});

test("adds a receipt item by type and CUIT", async ({ page }) => {
  const visitedUrls: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    visitedUrls.push(url);

    if (url.includes("verMenuDeducciones.do")) {
      await route.fulfill({
        contentType: "text/html",
        body: `
          <div id="div_tabla_deducciones_agrupadas">
            <table class="tablesorter" data-url-editar="verCuotasMedicoAsistenciales.do">
              <tbody>
                <tr data-id-reg="10004">
                  <td>30000000003</td>
                  <td>COBERTURA EJEMPLO</td>
                  <td>Enero</td>
                  <td>1100.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        `,
      });
      return;
    }

    await route.fulfill({
      contentType: "text/html",
      body: monthlyDeductionReceiptFormHtml(),
    });
  });

  await page.goto("https://serviciosjava2.afip.gob.ar/radig/jsp/start.do");
  await addDeductionReceiptItem(page, {
    deductionType: "cuotas-medico-asistenciales",
    cuit: "30000000003",
    month: 1,
    date: "2026-01-21",
    receiptType: "6",
    number: "0001-00000001",
    amount: "1100.00",
  });

  expect(visitedUrls.some((url) => url.includes("verCuotasMedicoAsistenciales.do?id=10004"))).toBe(
    true,
  );
});

test("fails when multiple deductions match type and CUIT", async ({ page }) => {
  await page.setContent(`
    <div id="div_tabla_deducciones_agrupadas">
      <table class="tablesorter" data-url-editar="verCuotasMedicoAsistenciales.do">
        <tbody>
          <tr data-id-reg="1"><td>30000000003</td><td>COBERTURA EJEMPLO</td><td>Enero</td><td>1.00</td></tr>
          <tr data-id-reg="2"><td>30000000003</td><td>COBERTURA EJEMPLO</td><td>Febrero</td><td>1.00</td></tr>
        </tbody>
      </table>
    </div>
  `);

  await expect(
    findDeductionByTypeAndCuit(page, "cuotas-medico-asistenciales", "30000000003"),
  ).rejects.toThrow("Se encontró más de una deducción cuotas-medico-asistenciales");
});

test("adds a medical expense receipt using the specific form fields", async ({ page }) => {
  await page.setContent(medicalExpenseFormHtml());

  await expect(
    addMedicalExpenseReceiptItemOnOpenPage(page, {
      cuit: "30000000004",
      month: 5,
      date: "2026-05-22",
      receiptType: "6",
      number: "0000300000222",
      amount: "100",
      reimbursedAmount: "0",
    }),
  ).resolves.toBeUndefined();

  await expect(page.locator("#mesDesde")).toHaveValue("5");
  await expect(page.locator("#cmpFechaEmision")).toHaveValue("22/05/2026");
  await expect(page.locator("#cmpPuntoVenta")).toHaveValue("00003");
  await expect(page.locator("#cmpNumero")).toHaveValue("00000222");
  await expect(page.locator("#cmpMontoFacturado")).toHaveValue("100");
  await expect(page.locator("#cmpMontoReintegrado")).toHaveValue("0");
  await expect(page.locator("#montoTotal")).toHaveValue("40,00");
});

test("opens an existing medical expense deduction by CUIT before adding a receipt", async ({
  page,
}) => {
  const visitedUrls: string[] = [];
  let menuRequests = 0;
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    visitedUrls.push(url);

    if (url.includes("verMenuDeducciones.do")) {
      menuRequests += 1;
      await route.fulfill({
        contentType: "text/html",
        body: medicalExpenseMenuHtml([{ id: "123", month: "Mayo", amount: "100.00" }]),
      });
      return;
    }

    await route.fulfill({
      contentType: "text/html",
      body: medicalExpenseFormHtml(menuRequests > 1 ? { number: "00003 - 00000222" } : undefined),
    });
  });

  await page.goto("https://serviciosjava2.afip.gob.ar/radig/jsp/start.do");
  await addMedicalExpenseReceiptItem(page, {
    cuit: "30000000004",
    month: 5,
    date: "2026-05-22",
    receiptType: "6",
    number: "0000300000222",
    amount: "100",
    reimbursedAmount: "0",
  });

  expect(visitedUrls.some((url) => url.includes("verGastosMedicos.do?id=123"))).toBe(true);
});

test("opens a new medical expense form when CUIT is not in the deductions list", async ({
  page,
}) => {
  const visitedUrls: string[] = [];
  let menuRequests = 0;
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    visitedUrls.push(url);

    if (url.includes("verMenuDeducciones.do")) {
      menuRequests += 1;
      await route.fulfill({
        contentType: "text/html",
        body:
          menuRequests === 1
            ? `<div id="div_tabla_deducciones_agrupadas"></div>`
            : medicalExpenseMenuHtml([{ id: "456", month: "Mayo", amount: "100.00" }]),
      });
      return;
    }

    await route.fulfill({
      contentType: "text/html",
      body: medicalExpenseFormHtml(menuRequests > 1 ? { number: "00003 - 00000222" } : undefined),
    });
  });

  await page.goto("https://serviciosjava2.afip.gob.ar/radig/jsp/start.do");
  await addMedicalExpenseReceiptItem(page, {
    cuit: "30000000004",
    month: 5,
    date: "2026-05-22",
    receiptType: "6",
    number: "0000300000222",
    amount: "100",
    reimbursedAmount: "0",
  });

  expect(visitedUrls.some((url) => url.endsWith("/radig/jsp/verGastosMedicos.do"))).toBe(true);
  expect(visitedUrls.some((url) => url.includes("verGastosMedicos.do?id=456"))).toBe(true);
});

test("opens a new medical expense form when CUIT exists only for another month", async ({
  page,
}) => {
  const visitedUrls: string[] = [];
  let menuRequests = 0;
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    visitedUrls.push(url);

    if (url.includes("verMenuDeducciones.do")) {
      menuRequests += 1;
      await route.fulfill({
        contentType: "text/html",
        body:
          menuRequests === 1
            ? medicalExpenseMenuHtml([{ id: "123", month: "Mayo", amount: "100.00" }])
            : medicalExpenseMenuHtml([
                { id: "123", month: "Mayo", amount: "100.00" },
                { id: "456", month: "Junio", amount: "400.00" },
              ]),
      });
      return;
    }

    await route.fulfill({
      contentType: "text/html",
      body: medicalExpenseFormHtml(menuRequests > 1 ? { number: "00003 - 00000428" } : undefined),
    });
  });

  await page.goto("https://serviciosjava2.afip.gob.ar/radig/jsp/start.do");
  await addMedicalExpenseReceiptItem(page, {
    cuit: "30000000004",
    month: 6,
    date: "2026-06-11",
    receiptType: "6",
    number: "0000300000428",
    amount: "1000",
    reimbursedAmount: "0",
  });

  expect(visitedUrls.some((url) => url.includes("verGastosMedicos.do?id=123"))).toBe(false);
  expect(visitedUrls.some((url) => url.endsWith("/radig/jsp/verGastosMedicos.do"))).toBe(true);
  expect(visitedUrls.some((url) => url.includes("verGastosMedicos.do?id=456"))).toBe(true);
});

test("removes a receipt row by compact receipt number", async ({ page }) => {
  await page.setContent(`
    <table id="tabla_comprobantes">
      <tbody>
        <tr data-id-reg="10008">
          <td>11/06/2026</td>
          <td>Factura B</td>
          <td>00003 - 00000428</td>
          <td>1000.00</td>
          <td>0.00</td>
          <td><div class="eliminar"><span>Eliminar</span></div></td>
        </tr>
      </tbody>
    </table>
    <input id="comprobantesEliminados" value="" />
  `);
  await page.locator(".eliminar span").evaluate((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("¿Está seguro que desea eliminar el comprobante?")) {
        return;
      }
      const row = button.closest("tr");
      const deletedInput = document.querySelector("#comprobantesEliminados") as HTMLInputElement;
      deletedInput.value = row?.getAttribute("data-id-reg") ?? "";
      row?.remove();
    });
  });

  await expect(removeReceiptByNumberOnOpenPage(page, "0000300000428")).resolves.toBe(true);
  await expect(page.locator("#tabla_comprobantes tbody tr")).toHaveCount(0);
  await expect(page.locator("#comprobantesEliminados")).toHaveValue("10008");
});

test("resolves deduction detail links from the list page", async ({ page }) => {
  await page.setContent(`
    <div id="div_tabla_deducciones_agrupadas">
      <fieldset class="ui-widget ui-widget-content ui-corner-all grupo_deducciones">
        <legend>
          <span>Primas de Ahorro correspondientes a Seguros Mixtos</span>
        </legend>
        <div>
          <table class="ui-widget ui-widget-content tablesorter tabla_retgan" data-url-editar="verPrimasAhorroSegMix.do">
            <tbody>
              <tr data-id-reg="10003">
                <td>30000000002</td>
                <td>ASEGURADORA EJEMPLO S.A.</td>
                <td>Enero - Marzo</td>
                <td class="columna_importe">4600.75</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  `);

  const deduction = await findDeductionById(page, "10003");
  expect(deduction).toEqual({
    type: "primas-ahorro-seguro",
    id: "10003",
    cuit: "30000000002",
    name: "ASEGURADORA EJEMPLO S.A.",
    period: "Enero - Marzo",
    amount: "4600.75",
    editUrl: "verPrimasAhorroSegMix.do",
  });

  await page.route(
    "https://serviciosjava2.afip.gob.ar/radig/jsp/verPrimasAhorroSegMix.do?id=10003",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<div id="contenido"><fieldset><legend>Entidad</legend><input id="numeroDoc" value="30000000002" /></fieldset></div>',
      }),
  );

  if (!deduction) {
    throw new Error("Expected to resolve the deduction link.");
  }
  await openDeductionDetail(page, deduction.editUrl, deduction.id);
  await expect(page.locator("#numeroDoc")).toHaveValue("30000000002");
});

test("detects and accepts the reminder modal", async ({ page }) => {
  await page.setContent(`
    <div class="ui-dialog ui-widget ui-widget-content ui-corner-all dialog-con-sombra ui-draggable">
      <span class="ui-dialog-title">Recordatorio - Formulario Borrador</span>
      <p>Recuerde que todos los datos modificados se guardaran en estado borrador.</p>
      <button type="button" onclick="this.closest('.ui-dialog').remove()">Aceptar</button>
    </div>
  `);

  const info = await acceptReminderModalIfPresent(page);

  expect(info).toEqual({
    title: "Recordatorio - Formulario Borrador",
    description: "Recuerde que todos los datos modificados se guardaran en estado borrador.",
  });
  await expect(page.locator(".ui-dialog")).toHaveCount(0);
});

test("lists people from btn_empresa buttons", async ({ page }) => {
  await page.setContent(`
    <form name="seleccionaEmpresaForm">
      <input type="button" class="btn_empresa" value="SAMPLE PERSON" onclick="document.getElementById('idcontribuyente').value='10011';" />
      <input type="button" class="btn_empresa" value="SECOND SAMPLE PERSON" onclick="document.getElementById('idcontribuyente').value='0';" />
    </form>
  `);

  await expect(listPersons(page)).resolves.toEqual([
    { id: "10011", name: "SAMPLE PERSON" },
    { id: "0", name: "SECOND SAMPLE PERSON" },
  ]);
});

test("recovers the worker menu after person selection redirects to employer", async ({ page }) => {
  const employerUrl = "https://serviciosjava2.afip.gob.ar/radig_emp/jsp/consulta.jsp";
  await page.route(employerUrl, (route) =>
    route.fulfill({ contentType: "text/html", body: "Consulta F572" }),
  );
  await page.route(
    `https://serviciosjava2.afip.gob.ar/radig/jsp/determinarContribuyente.do?codigo=${new Date().getFullYear()}`,
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<a id="btn_datos_personales">Datos Personales</a>',
      }),
  );
  await page.setContent(`<input type="button" class="btn_empresa" value="SAMPLE PERSON"
    onclick="setTimeout(() => location.href='${employerUrl}', 100)" />`);
  await selectPerson(page, "SAMPLE PERSON");
  await expect(page.locator("#btn_datos_personales")).toHaveCount(1);
});

test("reselects the requested person on the worker recovery page", async ({ page }) => {
  const employerUrl = "https://serviciosjava2.afip.gob.ar/radig_emp/jsp/consulta.jsp";
  const workerUrl = `https://serviciosjava2.afip.gob.ar/radig/jsp/determinarContribuyente.do?codigo=${new Date().getFullYear()}`;
  await page.route(employerUrl, (route) =>
    route.fulfill({ contentType: "text/html", body: "Consulta" }),
  );
  await page.route(workerUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<form name="seleccionaEmpresaForm">
      <input type="button" class="btn_empresa" value="OTHER PERSON">
      <input type="button" class="btn_empresa" value="SAMPLE PERSON"
        onclick="document.body.innerHTML = '<a id=&quot;btn_datos_personales&quot;>Datos Personales</a>'">
    </form>`,
    }),
  );
  await page.setContent(`<input type="button" class="btn_empresa" value="SAMPLE PERSON"
    onclick="location.href='${employerUrl}'">`);
  await selectPerson(page, "SAMPLE PERSON");
  expect(page.url()).toBe(workerUrl);
  await expect(page.locator("#btn_datos_personales")).toHaveCount(1);
});

test("stops after one worker recovery when person selection keeps redirecting to employer", async ({
  page,
}) => {
  const employerUrl = "https://serviciosjava2.afip.gob.ar/radig_emp/jsp/consulta.jsp";
  const workerUrl = `https://serviciosjava2.afip.gob.ar/radig/jsp/determinarContribuyente.do?codigo=${new Date().getFullYear()}`;
  let recoveryCount = 0;
  await page.route(employerUrl, (route) =>
    route.fulfill({ contentType: "text/html", body: "Consulta" }),
  );
  const personButton = `<input type="button" class="btn_empresa" value="SAMPLE PERSON"
    onclick="location.href='${employerUrl}'">`;
  await page.route(workerUrl, (route) => {
    recoveryCount += 1;
    return route.fulfill({ contentType: "text/html", body: personButton });
  });
  await page.setContent(personButton);
  await expect(selectPerson(page, "SAMPLE PERSON")).rejects.toThrow("Se abrió SiRADIG - Empleador");
  expect(recoveryCount).toBe(1);
});

test("rejects the employer service before treating it as person selection", async ({ page }) => {
  const employerUrl = "https://serviciosjava2.afip.gob.ar/radig_emp/jsp/menu_sel_empresa.jsp";
  await page.route(employerUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<form name="seleccionaEmpresaForm"><input type="button" class="btn_empresa" value="SAMPLE PERSON"></form>',
    }),
  );
  await page.goto(employerUrl);
  await expect(waitForPersonSelection(page)).rejects.toThrow("Se abrió SiRADIG - Empleador");
  await expect(selectPerson(page, "SAMPLE PERSON")).rejects.toThrow("Se abrió SiRADIG - Empleador");
});

test("selects a person from the btn_empresa id", async ({ page }) => {
  await page.setContent(`
    <form name="seleccionaEmpresaForm">
      <input type="hidden" name="idContribuyente" id="idcontribuyente">
      <input
        type="button"
        class="btn_empresa ui-button"
        value="SAMPLE PERSON"
        onclick="document.getElementById('idcontribuyente').value='10011';document.body.innerHTML = '<a href=&quot;verDatosPersonales.do&quot; id=&quot;btn_datos_personales&quot; class=&quot;ui-button&quot; role=&quot;button&quot;>Datos Personales</a>'"
      />
    </form>
  `);

  await selectPerson(page, "10011");

  await expect(page.locator("#btn_datos_personales")).toHaveCount(1);
});

test("selects a person from the btn_empresa input value", async ({ page }) => {
  await page.setContent(`
    <form name="seleccionaEmpresaForm">
      <input type="hidden" name="idContribuyente" id="idcontribuyente">
      <input
        type="button"
        class="btn_empresa ui-button"
        value="SAMPLE PERSON"
        onclick="document.getElementById('idcontribuyente').value='10011';document.body.innerHTML = '<a href=&quot;verDatosPersonales.do&quot; id=&quot;btn_datos_personales&quot; class=&quot;ui-button&quot; role=&quot;button&quot;>Datos Personales</a>'"
      />
    </form>
  `);

  await selectPerson(page, "SAMPLE PERSON");

  await expect(page.locator("#btn_datos_personales")).toHaveCount(1);
});

test("waits for person selection to finish loading", async ({ page }) => {
  await page.setContent(`<script>setTimeout(() => {
    document.body.innerHTML = '<form name="seleccionaEmpresaForm"><input type="button" class="btn_empresa" value="SAMPLE PERSON"></form>';
  }, 150)</script>`);
  await waitForPersonSelection(page);
  await expect(listPersons(page)).resolves.toEqual([{ id: null, name: "SAMPLE PERSON" }]);
});

test("does not interpret an unexpected SiRADIG page as an empty person list", async ({ page }) => {
  await page.setContent("<p>Servicio cargando</p>");
  await expect(waitForPersonSelection(page, { timeoutMs: 100 })).rejects.toThrow(
    "no se pudo confirmar el listado de personas",
  );
});

test("expands Ver Todos before opening SiRADIG", async ({ page }) => {
  const serviceUrl = "https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp";
  await page.route(serviceUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<form name='seleccionaEmpresaForm'></form>",
    }),
  );
  await page.setContent(`
    <button onclick="document.getElementById('services').hidden=false">Ver Todos</button>
    <div id="services" hidden><a href="${serviceUrl}">SiRADIG - Trabajador</a></div>
  `);
  const siradigPage = await openSiradigFromPortal(page);
  await waitForPersonSelection(siradigPage);
});

test("opens only the complete worker service label", async ({ page }) => {
  const workerUrl = "https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp";
  await page.route(workerUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<form name='seleccionaEmpresaForm'></form>",
    }),
  );
  await page.setContent(`
    <a href="https://example.test/employer">SiRADIG - Empleador</a>
    <a href="https://example.test/help">Ayuda SiRADIG - Trabajador</a>
    <a href="${workerUrl}">SIRADIG - Trabajador</a>
  `);
  const servicePage = await openSiradigFromPortal(page);
  expect(servicePage.url()).toBe(workerUrl);
});

test("recovers worker person selection when the portal opens employer", async ({ page }) => {
  const employerUrl = "https://serviciosjava2.afip.gob.ar/radig_emp/jsp/consulta.jsp";
  await page.route(employerUrl, (route) =>
    route.fulfill({ contentType: "text/html", body: "Consulta F572" }),
  );
  const workerUrl = `https://serviciosjava2.afip.gob.ar/radig/jsp/determinarContribuyente.do?codigo=${new Date().getFullYear()}`;
  await page.route(workerUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<form name="seleccionaEmpresaForm"></form>',
    }),
  );
  await page.setContent(`<a href="${employerUrl}">SiRADIG - Trabajador</a>`);
  const workerPage = await openSiradigFromPortal(page);
  expect(workerPage.url()).toBe(workerUrl);
  await waitForPersonSelection(workerPage);
});

test("opens SiRADIG from a portal anchor", async ({ page }) => {
  await page.route("https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<form name='seleccionaEmpresaForm'></form>",
    }),
  );

  await page.setContent(`
    <a href="https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp">
      SiRADIG - Trabajador
    </a>
  `);

  const siradigPage = await openSiradigFromPortal(page);

  expect(siradigPage).toBe(page);
  await expect(siradigPage.locator('form[name="seleccionaEmpresaForm"]')).toHaveCount(1);
});

test("opens SiRADIG from a visible service card despite a hidden duplicate", async ({ page }) => {
  const serviceUrl = "https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp";
  await page.route(serviceUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<form name='seleccionaEmpresaForm'></form>",
    }),
  );
  await page.setContent(`
    <a hidden href="${serviceUrl}">SiRADIG - Trabajador</a>
    <div onclick="location.href='${serviceUrl}'">
      <span>SIRADIG – Trabajador</span>
    </div>
  `);
  const siradigPage = await openSiradigFromPortal(page);
  expect(siradigPage).toBe(page);
  await expect(siradigPage.locator('form[name="seleccionaEmpresaForm"]')).toHaveCount(1);
});

test("opens SiRADIG from a button in a new tab", async ({ page }) => {
  const serviceUrl = "https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp";
  await page.context().route(serviceUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<form name='seleccionaEmpresaForm'></form>",
    }),
  );
  await page.setContent(
    `<button onclick="window.open('${serviceUrl}')">SiRADIG - Trabajador</button>`,
  );
  const siradigPage = await openSiradigFromPortal(page);
  expect(siradigPage).not.toBe(page);
  await expect(siradigPage.locator('form[name="seleccionaEmpresaForm"]')).toHaveCount(1);
});

test("runs the login browser predicate through tsx without injected helpers", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    `
      import assert from 'node:assert/strict';
      import { chromium } from 'playwright';
      import { SIRADIG_LOGIN_URL, ARCA_PORTAL_URL, loginToArca } from './src/arca/session.ts';
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.route(SIRADIG_LOGIN_URL, route => route.fulfill({
          contentType: 'text/html',
          body: \`<input type="number">
            <button onclick="document.getElementById('step').hidden=false">Siguiente</button>
            <div id="step" hidden><input type="password">
              <button onclick="setTimeout(()=>location.href='\${ARCA_PORTAL_URL}',100)">Ingresar</button>
            </div>\`
        }));
        await page.route(ARCA_PORTAL_URL, route => route.fulfill({ contentType: 'text/html', body: 'Portal' }));
        await loginToArca(page, { cuit: '20000000001', password: 'mock' });
        assert.equal(page.url(), ARCA_PORTAL_URL);
        console.log('tsx mocked login passed');
      } finally { await browser.close(); }
    `,
  ]);
  expect(stdout).toContain("tsx mocked login passed");
});

test("waits for delayed login errors and ignores hidden or empty messages", async ({ page }) => {
  await page.route(SIRADIG_LOGIN_URL, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
      <input id="F1:username" type="text" />
      <span id="F1:msg" hidden>Hidden error</span><p class="text-danger"></p>
      <button onclick="setTimeout(() => document.getElementById('password-step').hidden = false, 150)">Siguiente</button>
      <div id="password-step" hidden>
        <input type="password" />
        <button onclick="setTimeout(() => document.getElementById('error').textContent = 'Clave incorrecta', 150)">Ingresar</button>
        <p id="error" class="text-danger"></p>
      </div>
    `,
    }),
  );
  await expect(loginToArca(page, { cuit: "20000000001", password: "wrong" })).rejects.toThrow(
    "Clave incorrecta",
  );
});

for (const destination of [
  "https://serviciosjava2.afip.gob.ar/radig/jsp/determinarContribuyente.do?codigo=2026",
  "https://serviciosjava2.afip.gob.ar/radig/jsp/verMenuEmpleado.do",
]) {
  test(`logs in directly to SiRADIG without searching the portal: ${destination}`, async ({
    page,
  }) => {
    await page.route(destination, (route) =>
      route.fulfill({ contentType: "text/html", body: "SiRADIG" }),
    );
    await page.route(SIRADIG_LOGIN_URL, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `
          <input type="number" />
          <button onclick="document.getElementById('password-step').hidden = false">Siguiente</button>
          <div id="password-step" hidden>
            <input type="password" />
            <button onclick="setTimeout(() => location.href = '${destination}', 150)">Ingresar</button>
          </div>
        `,
      }),
    );
    await loginToArca(page, { cuit: "20000000001", password: "mock" });
    expect(page.url()).toBe(destination);
    const workerPage = await openSiradigFromPortal(page);
    expect(workerPage).toBe(page);
    expect(workerPage.url()).toBe(destination);
  });
}

test("waits for the portal after submitting the password", async ({ page }) => {
  const portalUrl = "https://portalcf.cloud.afip.gob.ar/portal/app/";
  await page.route(portalUrl, (route) =>
    route.fulfill({ contentType: "text/html", body: "Portal" }),
  );
  await page.route(SIRADIG_LOGIN_URL, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
      <input type="number" />
      <button onclick="document.getElementById('password-step').hidden = false">Siguiente</button>
      <div id="password-step" hidden>
        <input type="password" />
        <button onclick="setTimeout(() => location.href = '${portalUrl}', 150)">Ingresar</button>
      </div>
    `,
    }),
  );
  await loginToArca(page, { cuit: "20000000001", password: "test-password" });
  expect(page.url()).toBe(portalUrl);
});

test("throws a typed error when ARCA rejects credentials", async ({ page }) => {
  await page.route(SIRADIG_LOGIN_URL, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
        <input role="spinbutton" type="number" />
        <button onclick="document.body.innerHTML = '<input type=&quot;password&quot; /><button>Ingresar</button><p class=&quot;text-danger&quot;><span id=&quot;F1:msg&quot;>Clave o usuario incorrecto</span></p>'">
          Siguiente
        </button>
      `,
    }),
  );

  await expect(loginToArca(page, { cuit: "20000000001", password: "wrong" })).rejects.toThrow(
    ArcaLoginError,
  );
});

test("throws a typed error when ARCA rejects CUIT/CUIL", async ({ page }) => {
  await page.route(SIRADIG_LOGIN_URL, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
        <input role="spinbutton" type="number" />
        <button onclick="document.body.innerHTML = '<input role=&quot;spinbutton&quot; type=&quot;number&quot; /><p class=&quot;text-danger&quot;><span id=&quot;F1:msg&quot;>Número de CUIL/CUIT incorrecto</span></p>'">
          Siguiente
        </button>
      `,
    }),
  );

  await expect(loginToArca(page, { cuit: "1234", password: "irrelevant" })).rejects.toThrow(
    ArcaLoginError,
  );
});

test("lists the menu and enables only Datos Personales", async ({ page }) => {
  await page.setContent(`
    <table>
      <tr>
        <td><a href="verDatosPersonales.do" id="btn_datos_personales" class="ui-button" role="button">Datos Personales</a></td>
      </tr>
      <tr>
        <td><a href="consultarEmpleadores.do" id="btn_empleadores" class="ui-button" role="button">Empleadores</a></td>
      </tr>
      <tr>
        <td><a href="verMenuDeducciones.do" id="btn_carga" class="ui-button" role="button">Carga de Formulario</a></td>
      </tr>
    </table>
  `);

  await expect(listMenuItems(page)).resolves.toEqual([
    { label: "Datos Personales", enabled: true },
    { label: "Empleadores", enabled: false },
    { label: "Carga de Formulario", enabled: false },
  ]);
});

test("lists read-only menu actions even when draft actions are hidden", async ({ page }) => {
  await page.setContent(`
    <table>
      <tr>
        <td><a href="#" id="btn_nuevo_borrador" class="ui-button" role="button">Crear Nuevo Borrador</a></td>
      </tr>
      <tr>
        <td><a href="verDatosPersonales.do" id="btn_datos_personales" class="ui-button" role="button" style="display: none">Datos Personales</a></td>
      </tr>
      <tr>
        <td><a href="consultarEmpleadores.do" id="btn_empleadores" class="ui-button" role="button" style="display: none">Empleadores</a></td>
      </tr>
      <tr>
        <td><a href="verFormulariosEnviados.do" id="btn_consulta" class="ui-button" role="button">Consulta de Formularios Enviados</a></td>
      </tr>
    </table>
  `);

  await expect(listMenuItems(page)).resolves.toEqual([
    { label: "Datos Personales", enabled: true },
    { label: "Empleadores", enabled: false },
    { label: "Consulta de Formularios Enviados", enabled: false },
  ]);
});

test("opens Datos Personales by href when its menu button is hidden", async ({ page }) => {
  await page.route("https://serviciosjava2.afip.gob.ar/radig/jsp/verDatosPersonales.do", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<div id="contenido"><fieldset><legend>Apellido y Nombre</legend></fieldset></div>',
    }),
  );
  await page.goto("https://serviciosjava2.afip.gob.ar/radig/jsp/determinarContribuyente.do");
  await page.setContent(`
    <a href="verDatosPersonales.do" id="btn_datos_personales" class="ui-button" style="display: none">Datos Personales</a>
  `);

  await selectMenuItem(page, "Datos Personales");

  await expect(page.locator("#contenido")).toHaveCount(1);
});

test("returns from personal data to the main menu", async ({ page }) => {
  await page.setContent(`
    <a
      href="#"
      id="btn_volver"
      onclick="document.body.innerHTML = '<a href=&quot;verDatosPersonales.do&quot; id=&quot;btn_datos_personales&quot; class=&quot;ui-button&quot; role=&quot;button&quot;>Datos Personales</a>'"
    >
      Menú Principal
    </a>
  `);

  await returnToMainMenu(page);

  await expect(page.locator("#btn_datos_personales")).toHaveCount(1);
});

test("extracts grouped personal data", async ({ page }) => {
  await page.setContent(`
    <div id="contenido">
      <fieldset>
        <legend>Apellido y Nombre</legend>
        <table>
          <tr>
            <th>Apellido</th>
            <td><input type="text" value="SAMPLE SURNAME" /></td>
          </tr>
          <tr>
            <th>Nombre</th>
            <td><input type="text" value="SAMPLE NAME" /></td>
          </tr>
        </table>
      </fieldset>
      <fieldset>
        <legend>Domicilio</legend>
        <table>
          <tr>
            <th>Calle</th>
            <td><input type="text" value="SAMPLE STREET" /></td>
          </tr>
          <tr>
            <th>Nro.</th>
            <td>
              <input type="text" value="1234" />
              Piso <input type="text" value="4" />
              Dpto. <input type="text" value="A" />
            </td>
          </tr>
          <tr>
            <th>Provincia</th>
            <td>
              <input type="hidden" value="0" />
              <input type="text" value="Ciudad de Buenos Aires" />
            </td>
          </tr>
          <tr style="display: none">
            <th>Localidad</th>
            <td><input type="text" value="Should not appear" /></td>
          </tr>
        </table>
      </fieldset>
    </div>
  `);

  await expect(extractPersonalData(page)).resolves.toEqual([
    {
      title: "Apellido y Nombre",
      fields: [
        { label: "Apellido", value: "SAMPLE SURNAME" },
        { label: "Nombre", value: "SAMPLE NAME" },
      ],
    },
    {
      title: "Domicilio",
      fields: [
        { label: "Calle", value: "SAMPLE STREET" },
        { label: "Nro.", value: "1234 4 A" },
        { label: "Provincia", value: "Ciudad de Buenos Aires" },
      ],
    },
  ]);
});

test("lists employees from the employers table", async ({ page }) => {
  await page.setContent(`
    <div id="contenido">
      <table id="nueva_tabla_empleadores">
        <tbody>
          <tr data-id-reg="10011">
            <td>30000000005</td>
            <td> SAMPLE EMPLOYER S.A. </td>
            <td>01/01/2024</td>
            <td></td>
            <td>Sí</td>
            <td></td>
            <td></td>
          </tr>
          <tr data-id-reg="10012" style="display:none;">
            <td>30000000001</td>
            <td>HIDDEN EMPLOYER</td>
            <td>01/01/2020</td>
            <td></td>
            <td>No</td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `);

  await expect(listEmployees(page)).resolves.toEqual([
    {
      id: "10011",
      cuit: "30000000005",
      name: "SAMPLE EMPLOYER S.A.",
      startDate: "01/01/2024",
      endDate: null,
      withholdingAgent: "Sí",
    },
  ]);
});

test("finds an employee by CUIT", () => {
  expect(
    findEmployeeByCuit(
      [
        {
          id: "1",
          cuit: "30000000005",
          name: "SAMPLE EMPLOYER S.A.",
          startDate: "01/01/2024",
          endDate: null,
          withholdingAgent: "Sí",
        },
      ],
      "30000000005",
    ),
  ).toEqual({
    id: "1",
    cuit: "30000000005",
    name: "SAMPLE EMPLOYER S.A.",
    startDate: "01/01/2024",
    endDate: null,
    withholdingAgent: "Sí",
  });
  expect(findEmployeeByCuit([], "30000000005")).toBeNull();
});

test("opens employee details by employee id", async ({ page }) => {
  await page.route(
    "https://serviciosjava2.afip.gob.ar/radig/jsp/verEmpleador.do?id=10011",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `
        <div id="contenido">
          <input id="cuit" value="30000000005" />
          <input id="razonSocial" value="SAMPLE EMPLOYER S.A." />
        </div>
      `,
      }),
  );
  await page.goto("https://serviciosjava2.afip.gob.ar/radig/jsp/verMenuEmpleadores.do");

  await openEmployeeDetails(page, "10011");

  await expect(page.locator("#cuit")).toHaveValue("30000000005");
});

test("extracts grouped employee data", async ({ page }) => {
  await page.setContent(`
    <div id="contenido">
      <fieldset>
        <legend>Empleador</legend>
        <table class="formulario">
          <tr>
            <th>CUIT del Empleador</th>
            <td><input type="text" value="30000000005" /></td>
          </tr>
          <tr>
            <th>Razón Social o Apellido y Nombre</th>
            <td><input type="text" value="SAMPLE EMPLOYER S.A." /></td>
          </tr>
        </table>
      </fieldset>
      <fieldset>
        <legend>Relación Laboral</legend>
        <table class="formulario">
          <tr>
            <th>Fecha de Inicio de Relación</th>
            <td><input type="text" value="01/01/2024" /></td>
          </tr>
          <tr>
            <th>Fecha de Fin de Relación</th>
            <td><input type="text" value="" /></td>
          </tr>
          <tr>
            <th>¿Es su agente de retención?</th>
            <td>
              <select>
                <option>Seleccionar...</option>
                <option selected>Sí</option>
                <option>No</option>
              </select>
            </td>
          </tr>
        </table>
      </fieldset>
      <fieldset style="display:none;">
        <legend>Oculto</legend>
        <table class="formulario">
          <tr>
            <th>No debería aparecer</th>
            <td><input type="text" value="hidden" /></td>
          </tr>
        </table>
      </fieldset>
    </div>
  `);

  await expect(extractEmployeeData(page)).resolves.toEqual([
    {
      title: "Empleador",
      fields: [
        { label: "CUIT del Empleador", value: "30000000005" },
        { label: "Razón Social o Apellido y Nombre", value: "SAMPLE EMPLOYER S.A." },
      ],
    },
    {
      title: "Relación Laboral",
      fields: [
        { label: "Fecha de Inicio de Relación", value: "01/01/2024" },
        { label: "¿Es su agente de retención?", value: "Sí" },
      ],
    },
  ]);
});

test("lists deductions with stable ids and types", async ({ page }) => {
  await page.setContent(`
    <div id="div_tabla_deducciones_agrupadas">
      <fieldset class="ui-widget ui-widget-content ui-corner-all grupo_deducciones">
        <legend>
          <span>Cuotas Médico Asistenciales</span>
        </legend>
        <div>
          <table class="ui-widget ui-widget-content tablesorter tabla_retgan" data-url-editar="verCuotasMedicoAsistenciales.do">
            <tbody>
              <tr data-id-reg="10004">
                <td>30000000003</td>
                <td>COBERTURA MEDICA EJEMPLO</td>
                <td>Enero - Febrero</td>
                <td class="columna_importe">1200.00</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>
      <fieldset class="ui-widget ui-widget-content ui-corner-all grupo_deducciones">
        <legend>
          <span>Primas de Ahorro correspondientes a Seguros Mixtos</span>
        </legend>
        <div>
          <table class="ui-widget ui-widget-content tablesorter tabla_retgan" data-url-editar="verPrimasAhorroSegMix.do">
            <tbody>
              <tr data-id-reg="10003">
                <td>30000000002</td>
                <td>ASEGURADORA EJEMPLO S.A.</td>
                <td>Enero - Marzo</td>
                <td class="columna_importe">4600.75</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  `);

  await expect(listDeductions(page)).resolves.toEqual([
    {
      type: "cuotas-medico-asistenciales",
      id: "10004",
      cuit: "30000000003",
      name: "COBERTURA MEDICA EJEMPLO",
      period: "Enero - Febrero",
      amount: "1200.00",
    },
    {
      type: "primas-ahorro-seguro",
      id: "10003",
      cuit: "30000000002",
      name: "ASEGURADORA EJEMPLO S.A.",
      period: "Enero - Marzo",
      amount: "4600.75",
    },
  ]);
});

function medicalExpenseMenuHtml(
  rows: Array<{ id: string; month: string; amount: string }>,
): string {
  return `
    <div id="div_tabla_deducciones_agrupadas">
      <table class="tablesorter" data-url-editar="verGastosMedicos.do">
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr data-id-reg="${row.id}">
                  <td>30000000004</td>
                  <td>PRESTADOR MEDICO</td>
                  <td>${row.month}</td>
                  <td>${row.amount}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function monthlyDeductionReceiptFormHtml(): string {
  return `
    <table id="tabla_meses">
      <tbody>
        <tr data-id-reg="10006">
          <td>01 - Enero</td>
          <td>1100.00</td>
          <td>1100.00</td>
          <td><a href="#" class="agregar-comprobantes">Agregar Comprobante</a></td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div id="dialog_alta_comprobante" style="display:none;">
      <input id="cmpFechaEmision" />
      <select id="cmpTipo"><option value="6">Factura B</option></select>
      <div id="cmpDivPuntoVentaNumero"><input id="cmpPuntoVenta" /><input id="cmpNumero" /></div>
      <div id="cmpDivNumeroAlternativo" style="display:none;"><input id="cmpNumeroAlternativo" /></div>
      <input id="cmpMontoFacturado" />
      <button type="button">Agregar</button>
      <button type="button">Cancelar</button>
    </div>
    <button id="btn_guardar">Guardar</button>
    <script>
      document.querySelector("a.agregar-comprobantes").addEventListener("click", () => {
        document.querySelector("#dialog_alta_comprobante").style.display = "block";
      });
    </script>
  `;
}

function medicalExpenseFormHtml(receipt?: { number: string }): string {
  return `
    <input id="numeroDoc" />
    <input id="razonSocial" value="PRESTADOR MEDICO" />
    <select id="mesDesde">
      <option value="0">Seleccionar...</option>
      <option value="5">Mayo</option>
      <option value="6">Junio</option>
    </select>
    <input id="montoTotal" readonly />
    <table id="tabla_comprobantes">
      <tbody>
        ${
          receipt
            ? `<tr data-id-reg="10008">
                <td>11/06/2026</td>
                <td>Factura B</td>
                <td>${receipt.number}</td>
                <td>1000.00</td>
                <td>0.00</td>
                <td></td>
              </tr>`
            : ""
        }
      </tbody>
    </table>
    <a href="#" id="btn_alta_comprobante">Alta de Comprobante</a>
    <div id="dialog_alta_comprobante" style="display:none;">
      <input id="cmpFechaEmision" />
      <select id="cmpTipo">
        <option value="6">Factura B</option>
      </select>
      <div id="cmpDivPuntoVentaNumero"><input id="cmpPuntoVenta" /><input id="cmpNumero" /></div>
      <div id="cmpDivNumeroAlternativo" style="display:none;"><input id="cmpNumeroAlternativo" /></div>
      <input id="cmpMontoFacturado" />
      <input id="cmpMontoReintegrado" />
      <button type="button">Agregar</button>
      <button type="button">Cancelar</button>
    </div>
    <button id="btn_guardar">Guardar</button>
    <script>
      document.querySelector("#btn_alta_comprobante").addEventListener("click", () => {
        document.querySelector("#dialog_alta_comprobante").style.display = "block";
      });
      document.querySelector("#dialog_alta_comprobante button").addEventListener("click", () => {
        const row = document.createElement("tr");
        row.setAttribute("data-id-reg", "new");
        row.innerHTML = "<td>" + document.querySelector("#cmpFechaEmision").value + "</td>"
          + "<td>Factura B</td>"
          + "<td>" + document.querySelector("#cmpPuntoVenta").value + " - " + document.querySelector("#cmpNumero").value + "</td>"
          + "<td>" + Number(document.querySelector("#cmpMontoFacturado").value).toFixed(2) + "</td>"
          + "<td>" + Number(document.querySelector("#cmpMontoReintegrado").value).toFixed(2) + "</td>"
          + "<td></td>";
        document.querySelector("#tabla_comprobantes tbody").append(row);
        const netAmount = Number(document.querySelector("#cmpMontoFacturado").value) - Number(document.querySelector("#cmpMontoReintegrado").value);
        document.querySelector("#montoTotal").value = (netAmount * 0.4).toFixed(2).replace(".", ",");
      });
    </script>
  `;
}
