#!/usr/bin/env node
import "dotenv/config";

import {
  addDeductionMonthlyItem,
  addDeductionReceiptItem,
  extractDeductionDetail,
  findDeductionById,
  openDeductionDetail,
  openDeductionsMenu,
  readDeductions,
  removeMedicalExpenseReceiptItem,
} from "../arca/deductions.js";
import {
  extractEmployeeData,
  findEmployeeByCuit,
  openEmployeeDetails,
  readEmployees,
} from "../arca/employees.js";
import {
  type FormContext,
  openFormPreview,
  printFormDraft,
  readFormSummary,
  selectFormPeriod,
  verifyFormContext,
} from "../arca/form.js";
import { listMenuItems, returnToMainMenu, selectMenuItem } from "../arca/menu.js";
import { extractPersonalData } from "../arca/personal-data.js";
import {
  acceptReminderModal,
  acceptReminderModalIfPresent,
  listPersons,
  selectPerson,
  waitForPersonSelection,
} from "../arca/persons.js";
import { listReceiptTypes } from "../arca/receipt-types.js";
import {
  ARCA_LOGIN_URL,
  ARCA_PORTAL_URL,
  ArcaLoginError,
  type BrowserSession,
  closeBrowserSession,
  createBrowserSession,
  isExpiredPortalSessionUrl,
  loginToArca,
  openSiradigFromPortal,
} from "../arca/session.js";
import { submitForm } from "../arca/submission.js";
import { createSessionStore, type SessionStore, type StoredSession } from "../session/store.js";
import { formatCliError } from "./errors.js";
import { renderHelp } from "./help.js";
import { type CliCommand, parseCliOptions } from "./options.js";
import {
  promptCredentials,
  promptFormSubmission,
  promptMenuItem,
  promptMissingCredentials,
  promptPerson,
  promptPersonalDataAction,
} from "./prompts.js";
import {
  printDeductionDetail,
  printDeductions,
  printEmployeeData,
  printEmployees,
  printFormSummary,
  printPersonalData,
  printReceiptTypes,
  renderFormSummary,
} from "./render.js";
import {
  toStructuredDeductionDetail,
  toStructuredEmployeeData,
  toStructuredPersonalData,
} from "./structured-output.js";

const PERSON_SELECTION_URL = "https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp";

async function main(): Promise<void> {
  const command = parseCliOptions(process.argv.slice(2));
  const store = createSessionStore();

  switch (command.kind) {
    case "help":
      console.log(
        renderHelp(command.topic, {
          width: process.stdout.columns,
          color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
        }),
      );
      return;
    case "interactive":
      await runInteractive(command);
      return;
    case "login":
      await runLogin(command, store);
      return;
    case "logout":
      await runLogout(store);
      return;
    case "persons-list":
      await runPersonsList(command, store);
      return;
    case "persons-select":
      await runPersonsSelect(command, store);
      return;
    case "persons-personal-data-show":
      await runPersonPersonalDataShow(command, store);
      return;
    case "persons-employees-list":
      await runPersonEmployeesList(command, store);
      return;
    case "persons-employees-show":
      await runPersonEmployeesShow(command, store);
      return;
    case "form-summary":
    case "form-show":
    case "form-print":
      await runFormPreview(command, store);
      return;
    case "form-submit":
      await runFormSubmit(command, store);
      return;
    case "form-deductions-list":
      await runFormDeductionsList(command, store);
      return;
    case "form-deductions-list-receipt-types":
      await runFormDeductionsListReceiptTypes(command);
      return;
    case "form-deductions-show":
      await runFormDeductionsShow(command, store);
      return;
    case "form-deductions-add-item":
      await runFormDeductionsAddItem(command, store);
      return;
    case "form-deductions-add-item-receipt":
      await runFormDeductionsAddItemReceipt(command, store);
      return;
    case "form-deductions-remove-item-receipt":
      await runFormDeductionsRemoveItemReceipt(command, store);
      return;
  }
}

async function runLogin(
  command: Extract<CliCommand, { kind: "login" }>,
  store: SessionStore,
): Promise<void> {
  if (!command.hasExplicitCredentials) {
    const currentSession = await store.read();
    if (currentSession && (await canListPersons(command.headless, currentSession.storageState))) {
      console.log(`Ya estás logueado con CUIT/CUIL ${currentSession.cuit}.`);
      return;
    }
  }

  const credentials = await promptMissingCredentials(
    {
      cuit: command.cuit,
      password: command.password,
    },
    {
      cuit: process.env.ARCA_CUIT,
      password: process.env.ARCA_PASSWORD,
    },
  );

  const session = await createBrowserSession({ headless: command.headless });
  try {
    console.log("\nIngresando a ARCA...");
    await loginToArca(session.page, credentials);

    console.log("Abriendo SiRADIG - Trabajador...");
    session.page = await openSiradigFromPortal(session.page);

    const selectedPerson = await autoSelectFirstPersonAfterLogin(session);
    if (selectedPerson) {
      await saveSelectedPersonSession(store, credentials.cuit, session, selectedPerson);
    } else {
      await store.write({
        cuit: credentials.cuit,
        createdAt: new Date().toISOString(),
        storageState: await session.context.storageState(),
      });
    }

    console.log(`Sesión guardada para CUIT/CUIL ${credentials.cuit}.`);
    if (selectedPerson) {
      console.log(
        `Persona seleccionada: ${selectedPerson.name}${selectedPerson.id ? ` (ID de selección: ${selectedPerson.id})` : ""}.`,
      );
    } else {
      console.log("No se encontraron personas en la pantalla de selección de SiRADIG.");
    }
  } finally {
    await closeBrowserSession(session);
  }
}

async function runLogout(store: SessionStore): Promise<void> {
  const currentSession = await store.read();
  await store.clear();

  if (!currentSession) {
    console.log("No había una sesión guardada.");
    return;
  }

  console.log(`Sesión eliminada para CUIT/CUIL ${currentSession.cuit}.`);
}

async function autoSelectFirstPersonAfterLogin(
  session: BrowserSession,
): Promise<StoredSession["selectedPerson"]> {
  await waitForPersonSelection(session.page);
  await acceptReminderModalIfPresent(session.page);

  const persons = await listPersons(session.page);
  const selectedPerson = persons[0] ?? null;
  if (!selectedPerson) {
    return null;
  }

  await selectPerson(session.page, selectedPerson.id ?? selectedPerson.name);
  await acceptReminderModal(session.page, { timeoutMs: 5_000 });

  return selectedPerson;
}

async function runPersonsList(
  command: Extract<CliCommand, { kind: "persons-list" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    if (!(await openPersonSelectionPage(session, store, cuit))) {
      return;
    }

    await acceptReminderModalIfPresent(session.page);

    const persons = await listPersons(session.page);
    if (persons.length === 0) {
      console.error("No se pudieron listar personas. Ejecutá `arca-siradig login`.");
      process.exitCode = 1;
      return;
    }

    if (command.format === "json") {
      console.log(JSON.stringify(persons));
      return;
    }

    console.log("Personas disponibles:");
    for (const person of persons) {
      console.log(formatPersonText(person.id, person.name));
    }
  } finally {
    await closeBrowserSession(session);
  }
}

async function runPersonsSelect(
  command: Extract<CliCommand, { kind: "persons-select" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    if (!(await openPersonSelectionPage(session, store, cuit))) {
      return;
    }

    await acceptReminderModalIfPresent(session.page);

    const persons = await listPersons(session.page);
    if (persons.length === 0) {
      console.error("No se pudieron listar personas. Ejecutá `arca-siradig login`.");
      process.exitCode = 1;
      return;
    }

    const selectedPerson = persons.find(
      (person) => person.id === command.person || person.name === command.person,
    );

    if (!selectedPerson) {
      console.error(`No se encontró la persona "${command.person}".`);
      process.exitCode = 1;
      return;
    }

    await selectPerson(session.page, command.person);
    await acceptReminderModal(session.page, { timeoutMs: 5_000 });
    await saveSelectedPersonSession(store, cuit, session, selectedPerson);

    console.log(
      `Persona seleccionada: ${selectedPerson.name}${selectedPerson.id ? ` (ID de selección: ${selectedPerson.id})` : ""}.`,
    );
  } finally {
    await closeBrowserSession(session);
  }
}

async function runPersonPersonalDataShow(
  command: Extract<CliCommand, { kind: "persons-personal-data-show" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      activeSession.selectedPerson,
    );
    if (!personReady) {
      return;
    }

    if (
      !(await navigateWithSessionRefresh(session, store, cuit, (page) =>
        selectMenuItem(page, "Datos Personales"),
      ))
    ) {
      return;
    }
    const personalData = await extractPersonalData(session.page);

    if (command.format === "json") {
      console.log(JSON.stringify(toStructuredPersonalData(personalData)));
      return;
    }

    printPersonalData(personalData);
  } finally {
    await closeBrowserSession(session);
  }
}

async function runPersonEmployeesList(
  command: Extract<CliCommand, { kind: "persons-employees-list" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      activeSession.selectedPerson,
    );
    if (!personReady) {
      return;
    }

    const employees = await readWithSessionRefresh(session, store, cuit, readEmployees);
    if (employees === null) return;

    if (command.format === "json") {
      console.log(JSON.stringify(employees));
      return;
    }

    printEmployees(employees);
  } finally {
    await closeBrowserSession(session);
  }
}

async function runPersonEmployeesShow(
  command: Extract<CliCommand, { kind: "persons-employees-show" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      activeSession.selectedPerson,
    );
    if (!personReady) {
      return;
    }

    const employees = await readWithSessionRefresh(session, store, cuit, readEmployees);
    if (employees === null) return;
    const employee = findEmployeeByCuit(employees, command.employeeCuit);

    if (!employee) {
      console.error(`No se encontró un empleador con CUIT ${command.employeeCuit}.`);
      process.exitCode = 1;
      return;
    }

    if (
      !(await navigateWithSessionRefresh(session, store, cuit, (page) =>
        openEmployeeDetails(page, employee.id),
      ))
    ) {
      return;
    }
    const employeeData = await extractEmployeeData(session.page);

    if (command.format === "json") {
      console.log(JSON.stringify(toStructuredEmployeeData(employeeData)));
      return;
    }

    printEmployeeData(employeeData);
  } finally {
    await closeBrowserSession(session);
  }
}

function printFormContext(context: FormContext): void {
  console.log(
    `Persona: ${context.person.id} - ${context.person.name}\nPeríodo fiscal: ${context.period}`,
  );
}

async function runFormPreview(
  command: Extract<CliCommand, { kind: "form-summary" | "form-show" | "form-print" }>,
  store: SessionStore,
): Promise<void> {
  const active = await openStoredSession(command.headless, store);
  if (!active) return;
  const { session, cuit } = active;
  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      active.selectedPerson,
    );
    if (!personReady) return;
    const context = await selectFormPeriod(session.page, {
      period: command.period,
      person: personReady.name,
      selector: personReady.id ?? personReady.name,
    });
    if (command.kind === "form-show") {
      if (command.format === "json") console.log(JSON.stringify(context));
      else printFormContext(context);
      return;
    }
    if (!(await navigateWithSessionRefresh(session, store, cuit, openFormPreview, context))) return;
    await verifyFormContext(session.page, { period: context.period, person: context.person.id });
    if (command.kind === "form-print") {
      if (!command.path) throw new Error("--path is required.");
      const savedPath = await printFormDraft(session.page, command.path, context.period);
      printFormContext(context);
      console.log(`Borrador guardado en: ${savedPath}`);
      return;
    }
    const summary = await readFormSummary(session.page);
    if (command.format === "json") {
      console.log(JSON.stringify(summary));
      return;
    }
    printFormSummary(summary);
  } finally {
    await closeBrowserSession(session);
  }
}

async function runFormSubmit(
  command: Extract<CliCommand, { kind: "form-submit" }>,
  store: SessionStore,
): Promise<void> {
  if (!command.accept && !process.stdin.isTTY) {
    throw new Error(
      "El envío requiere aceptar o cancelar en una terminal interactiva. Para confirmar directamente usá --aceptar.",
    );
  }
  const active = await openStoredSession(command.headless, store);
  if (!active) return;
  const { session, cuit } = active;
  try {
    const selectedPerson = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      active.selectedPerson,
    );
    if (!selectedPerson) return;
    const context = await selectFormPeriod(session.page, {
      period: command.period,
      person: selectedPerson.name,
      selector: selectedPerson.id ?? selectedPerson.name,
    });
    if (!(await navigateWithSessionRefresh(session, store, cuit, openFormPreview, context))) return;
    await verifyFormContext(session.page, { period: context.period, person: context.person.id });
    const summary = await readFormSummary(session.page);
    console.error(
      renderFormSummary(summary, {
        color: Boolean(process.stderr.isTTY) && !process.env.NO_COLOR,
        width: process.stderr.columns,
      }),
    );
    const result = await submitForm(session.page, context, {
      accept: command.accept,
      confirm: async (message) => {
        console.error(`\n${message}\n`);
        return promptFormSubmission();
      },
    });
    if (command.format === "json") console.log(JSON.stringify(result));
    else {
      console.log(`\n${result.message}`);
      if (result.reference) console.log(`Número de presentación: ${result.reference}`);
    }
    if (result.status === "rejected" || result.status === "unconfirmed") process.exitCode = 1;
  } finally {
    await closeBrowserSession(session);
  }
}

async function runFormDeductionsList(
  command: Extract<CliCommand, { kind: "form-deductions-list" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      activeSession.selectedPerson,
    );
    if (!personReady) {
      return;
    }

    const formContext = await selectFormPeriod(session.page, {
      period: command.period,
      person: personReady.name,
      selector: personReady.id ?? personReady.name,
    });

    const deductions = await readWithSessionRefresh(
      session,
      store,
      cuit,
      readDeductions,
      formContext,
    );
    if (deductions === null) return;

    if (command.format === "json") {
      console.log(JSON.stringify({ ...formContext, deductions }));
      return;
    }

    printFormContext(formContext);
    printDeductions(deductions);
  } finally {
    await closeBrowserSession(session);
  }
}

async function runFormDeductionsListReceiptTypes(
  command: Extract<CliCommand, { kind: "form-deductions-list-receipt-types" }>,
): Promise<void> {
  const receiptTypes = listReceiptTypes();

  if (command.format === "json") {
    console.log(JSON.stringify(receiptTypes));
    return;
  }

  printReceiptTypes(receiptTypes);
}

async function runFormDeductionsShow(
  command: Extract<CliCommand, { kind: "form-deductions-show" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      activeSession.selectedPerson,
    );
    if (!personReady) {
      return;
    }
    const formContext = await selectFormPeriod(session.page, {
      period: command.period,
      person: personReady.name,
      selector: personReady.id ?? personReady.name,
    });

    if (
      !(await navigateWithSessionRefresh(session, store, cuit, openDeductionsMenu, formContext))
    ) {
      return;
    }

    const deduction = await findDeductionById(session.page, command.deductionId);
    if (!deduction) {
      console.error(`No se encontró una deducción con ID ${command.deductionId}.`);
      process.exitCode = 1;
      return;
    }

    if (
      !(await navigateWithSessionRefresh(
        session,
        store,
        cuit,
        (page) => openDeductionDetail(page, deduction.editUrl, deduction.id),
        formContext,
      ))
    ) {
      return;
    }

    const deductionDetail = await extractDeductionDetail(session.page);

    if (command.format === "json") {
      console.log(
        JSON.stringify({ ...formContext, deduction: toStructuredDeductionDetail(deductionDetail) }),
      );
      return;
    }

    printFormContext(formContext);
    printDeductionDetail(deductionDetail);
  } finally {
    await closeBrowserSession(session);
  }
}

async function runFormDeductionsAddItem(
  command: Extract<CliCommand, { kind: "form-deductions-add-item" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      activeSession.selectedPerson,
    );
    if (!personReady) {
      return;
    }
    const formContext = await selectFormPeriod(session.page, {
      period: command.period,
      person: personReady.name,
      selector: personReady.id ?? personReady.name,
    });

    await verifyFormContext(session.page, {
      period: formContext.period,
      person: formContext.person.id,
    });
    printFormContext(formContext);
    await addDeductionMonthlyItem(session.page, {
      deductionType: command.deductionType,
      cuit: command.cuit,
      month: command.month,
      amount: command.amount,
    });
  } catch (error) {
    handleCommandError(error);
  } finally {
    await closeBrowserSession(session);
  }
}

async function runFormDeductionsAddItemReceipt(
  command: Extract<CliCommand, { kind: "form-deductions-add-item-receipt" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      activeSession.selectedPerson,
    );
    if (!personReady) {
      return;
    }
    const formContext = await selectFormPeriod(session.page, {
      period: command.period,
      person: personReady.name,
      selector: personReady.id ?? personReady.name,
    });

    await verifyFormContext(session.page, {
      period: formContext.period,
      person: formContext.person.id,
    });
    printFormContext(formContext);
    await addDeductionReceiptItem(session.page, {
      deductionType: command.deductionType,
      cuit: command.cuit,
      month: command.month,
      date: command.date,
      receiptType: command.receiptType,
      number: command.number,
      amount: command.amount,
      reimbursedAmount: command.reimbursedAmount,
    });
  } catch (error) {
    handleCommandError(error);
  } finally {
    await closeBrowserSession(session);
  }
}

async function runFormDeductionsRemoveItemReceipt(
  command: Extract<CliCommand, { kind: "form-deductions-remove-item-receipt" }>,
  store: SessionStore,
): Promise<void> {
  const activeSession = await openStoredSession(command.headless, store);
  if (!activeSession) {
    return;
  }
  const { session, cuit } = activeSession;

  try {
    const personReady = await ensurePersonSelected(
      session,
      store,
      cuit,
      command.person,
      activeSession.selectedPerson,
    );
    if (!personReady) {
      return;
    }
    const formContext = await selectFormPeriod(session.page, {
      period: command.period,
      person: personReady.name,
      selector: personReady.id ?? personReady.name,
    });

    if (command.deductionType !== "gastos-medicos") {
      throw new Error(`remove-item-receipt does not support type ${command.deductionType}.`);
    }

    await verifyFormContext(session.page, {
      period: formContext.period,
      person: formContext.person.id,
    });
    printFormContext(formContext);
    await removeMedicalExpenseReceiptItem(session.page, {
      cuit: command.cuit,
      number: command.number,
    });
  } catch (error) {
    handleCommandError(error);
  } finally {
    await closeBrowserSession(session);
  }
}

async function canListPersons(
  headless: boolean,
  storageState: StoredSession["storageState"],
): Promise<boolean> {
  const session = await createBrowserSession({ headless, storageState });

  try {
    await session.page.goto(PERSON_SELECTION_URL, { waitUntil: "domcontentloaded" });
    if (isExpiredPortalSessionUrl(session.page.url())) {
      await session.page.goto(ARCA_PORTAL_URL, { waitUntil: "domcontentloaded" });
      if (await isLoginPage(session.page)) {
        return false;
      }

      session.page = await openSiradigFromPortal(session.page);
      await session.page.goto(PERSON_SELECTION_URL, { waitUntil: "domcontentloaded" });
    }

    if (await isLoginPage(session.page)) {
      return false;
    }

    return (await listPersons(session.page)).length > 0;
  } catch {
    return false;
  } finally {
    await closeBrowserSession(session);
  }
}

async function openStoredSession(
  headless: boolean,
  store: SessionStore,
): Promise<{
  cuit: string;
  selectedPerson: StoredSession["selectedPerson"];
  session: Awaited<ReturnType<typeof createBrowserSession>>;
} | null> {
  const storedSession = await store.read();
  if (!storedSession) {
    console.error("No hay una sesión guardada. Ejecutá `arca-siradig login`.");
    process.exitCode = 1;
    return null;
  }

  return {
    cuit: storedSession.cuit,
    selectedPerson: storedSession.selectedPerson ?? null,
    session: await createBrowserSession({
      headless,
      storageState: storedSession.storageState,
    }),
  };
}

async function openPersonSelectionPage(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
): Promise<boolean> {
  if (
    !(await navigateWithSessionRefresh(session, store, cuit, (page) =>
      page.goto(PERSON_SELECTION_URL, { waitUntil: "domcontentloaded" }),
    ))
  ) {
    return false;
  }

  if (await isLoginPage(session.page)) {
    console.error("La sesión expiró. Ejecutá `arca-siradig login`.");
    process.exitCode = 1;
    return false;
  }

  return true;
}

async function ensurePersonSelected(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
  personIdentifier: string | undefined,
  storedSelectedPerson: StoredSession["selectedPerson"],
): Promise<StoredSession["selectedPerson"]> {
  const targetPerson = await resolveTargetPerson(personIdentifier, storedSelectedPerson);
  if (!targetPerson) {
    console.error(formatNoSelectedPersonMessage());
    process.exitCode = 1;
    return null;
  }

  if (!(await openPersonSelectionPage(session, store, cuit))) {
    return null;
  }

  await acceptReminderModalIfPresent(session.page);

  const persons = await listPersons(session.page);
  if (persons.length === 0) {
    console.error("No se pudieron listar personas. Ejecutá `arca-siradig login`.");
    process.exitCode = 1;
    return null;
  }

  const selectedPerson = persons.find(
    (person) => person.id === targetPerson || person.name === targetPerson,
  );
  if (!selectedPerson) {
    console.error(`No se encontró la persona "${targetPerson}".`);
    process.exitCode = 1;
    return null;
  }

  await selectPerson(session.page, selectedPerson.id ?? selectedPerson.name);
  await acceptReminderModal(session.page, { timeoutMs: 5_000 });
  await saveSelectedPersonSession(store, cuit, session, selectedPerson);

  return selectedPerson;
}

async function resolveTargetPerson(
  personIdentifier: string | undefined,
  storedSelectedPerson: StoredSession["selectedPerson"],
): Promise<string | null> {
  if (personIdentifier) {
    return personIdentifier;
  }

  if (storedSelectedPerson?.id) {
    return storedSelectedPerson.id;
  }

  if (storedSelectedPerson?.name) {
    return storedSelectedPerson.name;
  }

  return null;
}

function formatPersonText(id: string | null, name: string): string {
  return `ID de selección: ${id ?? ""}\nNombre Completo: ${name}`;
}

function formatNoSelectedPersonMessage(): string {
  return [
    "No hay una persona seleccionada.",
    "Ejecutá:",
    "- `arca-siradig persons list` para ver las personas disponibles y luego",
    "- `arca-siradig persons select <id|nombre>`.",
  ].join("\n");
}

async function saveSelectedPersonSession(
  store: SessionStore,
  cuit: string,
  session: BrowserSession,
  selectedPerson: StoredSession["selectedPerson"],
): Promise<void> {
  await store.write({
    cuit,
    createdAt: new Date().toISOString(),
    selectedPerson,
    storageState: await session.context.storageState(),
  });
}

async function readWithSessionRefresh<T>(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
  read: (page: Parameters<typeof loginToArca>[0]) => Promise<T>,
  formContext?: FormContext,
): Promise<T | null> {
  let result: T | null = null;
  const ready = await navigateWithSessionRefresh(
    session,
    store,
    cuit,
    async (page) => {
      result = await read(page);
    },
    formContext,
  );
  return ready ? result : null;
}

async function navigateWithSessionRefresh(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
  navigate: (page: Parameters<typeof loginToArca>[0]) => Promise<unknown>,
  formContext?: FormContext,
): Promise<boolean> {
  const navigatedPage = await navigate(session.page);
  if (isBrowserPage(navigatedPage)) {
    session.page = navigatedPage;
  }

  if (!isExpiredPortalSessionUrl(session.page.url())) {
    return true;
  }

  const selectedPerson = formContext ? (await store.read())?.selectedPerson : null;
  if (!(await refreshSiradigSession(session, store, cuit))) {
    console.error("La sesión expiró. Ejecutá `arca-siradig login`.");
    process.exitCode = 1;
    return false;
  }

  if (formContext) {
    const restoredPerson = await ensurePersonSelected(
      session,
      store,
      cuit,
      undefined,
      selectedPerson ?? { id: null, name: formContext.person.name },
    );
    if (!restoredPerson) return false;
    await selectFormPeriod(session.page, {
      period: formContext.period,
      person: formContext.person.id,
      selector: restoredPerson.id ?? restoredPerson.name,
    });
  }
  const retriedPage = await navigate(session.page);
  if (isBrowserPage(retriedPage)) {
    session.page = retriedPage;
  }

  if (isExpiredPortalSessionUrl(session.page.url())) {
    console.error("La sesión expiró. Ejecutá `arca-siradig login`.");
    process.exitCode = 1;
    return false;
  }

  return true;
}

function isBrowserPage(value: unknown): value is Parameters<typeof loginToArca>[0] {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "url" in value && "goto" in value;
}

async function refreshSiradigSession(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
): Promise<boolean> {
  await session.page.goto(ARCA_PORTAL_URL, { waitUntil: "domcontentloaded" });
  if (await isLoginPage(session.page)) {
    return false;
  }

  session.page = await openSiradigFromPortal(session.page);
  await store.write({
    cuit,
    createdAt: new Date().toISOString(),
    storageState: await session.context.storageState(),
  });

  return true;
}

async function runInteractive(
  command: Extract<CliCommand, { kind: "interactive" }>,
): Promise<void> {
  const session = await createBrowserSession({ headless: command.headless });

  try {
    await promptAndLogin(session.page);

    console.log("Abriendo SiRADIG - Trabajador...");
    const siradigPage = await openSiradigFromPortal(session.page);

    await acceptReminderModalIfPresent(siradigPage);

    const persons = await listPersons(siradigPage);
    if (persons.length === 0) {
      throw new Error("No people were found to manage.");
    }

    const selectedPerson = await promptPerson(persons);
    await selectPerson(siradigPage, selectedPerson.id ?? selectedPerson.name);

    await acceptReminderModal(siradigPage, { timeoutMs: 5_000 });

    while (true) {
      const menuItems = await listMenuItems(siradigPage);
      if (menuItems.length === 0) {
        throw new Error("No actions were found in the main menu.");
      }

      const selectedMenuItem = await promptMenuItem(menuItems);
      await selectMenuItem(siradigPage, selectedMenuItem.label);

      const personalData = await extractPersonalData(siradigPage);
      printPersonalData(personalData);

      await promptPersonalDataAction();
      await returnToMainMenu(siradigPage);
    }
  } finally {
    await closeBrowserSession(session);
  }
}

async function promptAndLogin(page: Parameters<typeof loginToArca>[0]): Promise<void> {
  let cuitDefault = process.env.ARCA_CUIT;
  let usePasswordDefault = true;

  while (true) {
    const credentials = await promptCredentials(
      {
        cuit: cuitDefault,
        password: process.env.ARCA_PASSWORD,
      },
      { usePasswordDefault },
    );
    cuitDefault = credentials.cuit;

    try {
      console.log("\nIngresando a ARCA...");
      await loginToArca(page, credentials);
      return;
    } catch (error) {
      if (!(error instanceof ArcaLoginError)) {
        throw error;
      }

      console.error(`\nARCA rechazó las credenciales: ${error.message}`);
      console.error("Intentá nuevamente.\n");
      usePasswordDefault = false;
    }
  }
}

async function isLoginPage(page: Parameters<typeof loginToArca>[0]): Promise<boolean> {
  return page.url().startsWith(ARCA_LOGIN_URL) || page.getByRole("spinbutton").isVisible();
}

function handleCommandError(error: unknown): void {
  const message = formatCliError(error);
  console.error(message);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = formatCliError(error);
  console.error(`\nError: ${message}`);
  process.exitCode = 1;
});
