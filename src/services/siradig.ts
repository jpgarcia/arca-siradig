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
import { selectMenuItem } from "../arca/menu.js";
import { extractPersonalData } from "../arca/personal-data.js";
import { acceptReminderModalIfPresent, listPersons } from "../arca/persons.js";
import { type BrowserSession, closeBrowserSession, createBrowserSession } from "../arca/session.js";
import { createSessionStore, type SessionStore } from "../session/store.js";
import {
  ensurePersonSelected,
  navigateWithSessionRefresh,
  openPersonSelectionPage,
  openStoredSession,
  readWithSessionRefresh,
} from "./session.js";
import {
  toStructuredDeductionDetail,
  toStructuredEmployeeData,
  toStructuredPersonalData,
} from "./structured-output.js";

export type PersonOptions = { person?: string };
export type FormOptions = PersonOptions & { period?: number };
export type WriteOptions = { person: string; period: number };
type ActiveSession = Awaited<ReturnType<typeof openStoredSession>>;
type MonthlyItem = Parameters<typeof addDeductionMonthlyItem>[1];
type ReceiptItem = Parameters<typeof addDeductionReceiptItem>[1];
type RemoveReceipt = Parameters<typeof removeMedicalExpenseReceiptItem>[1];

export class SiradigService {
  private readonly store: SessionStore;
  private readonly headless: boolean;
  private readonly allowWrites: boolean;
  private readonly createBrowser: typeof createBrowserSession;
  private queue: Promise<unknown> = Promise.resolve();
  private activeSession: BrowserSession | null = null;
  private readonly closingSessions = new WeakMap<BrowserSession, Promise<void>>();
  private closed = false;

  constructor(
    options: {
      store?: SessionStore;
      headless?: boolean;
      allowWrites?: boolean;
      createBrowser?: typeof createBrowserSession;
    } = {},
  ) {
    this.store = options.store ?? createSessionStore();
    this.headless = options.headless ?? true;
    this.allowWrites = options.allowWrites ?? false;
    this.createBrowser = options.createBrowser ?? createBrowserSession;
  }

  /** Read metadata only. A saved session is not proof that ARCA still accepts it. */
  sessionStatus() {
    return this.serialize(async () => {
      const stored = await this.store.read();
      return {
        savedSession: Boolean(stored),
        authentication: stored ? "not-checked" : "missing",
        selectedPerson: stored?.selectedPerson ?? null,
        allowWrites: this.allowWrites,
        loginCommand: "npx arca-siradig login",
        message: stored
          ? "La sesión se verificará al consultar ARCA. Si expiró, ejecutá el login en tu terminal y volvé a intentar."
          : "Iniciá sesión en tu terminal; no compartas la clave fiscal con el chat.",
      };
    });
  }

  personsList() {
    return this.withSession(async (active) => {
      await openPersonSelectionPage(active.session, this.store, active.cuit);
      await acceptReminderModalIfPresent(active.session.page);
      return { persons: await listPersons(active.session.page) };
    });
  }

  personSelect(person: string) {
    return this.withSession(async (active) => ({
      person: await this.selectPerson(active, { person }),
    }));
  }

  personalData(options: PersonOptions) {
    return this.withSession(async (active) => {
      const person = await this.selectPerson(active, options);
      await navigateWithSessionRefresh(active.session, this.store, active.cuit, (page) =>
        selectMenuItem(page, "Datos Personales"),
      );
      return {
        person,
        data: toStructuredPersonalData(await extractPersonalData(active.session.page)),
      };
    });
  }

  employersList(options: PersonOptions) {
    return this.withSession(async (active) => {
      const person = await this.selectPerson(active, options);
      const employers = await readWithSessionRefresh(
        active.session,
        this.store,
        active.cuit,
        readEmployees,
      );
      return { person, employers };
    });
  }

  employerShow(options: PersonOptions & { cuit: string }) {
    return this.withSession(async (active) => {
      const person = await this.selectPerson(active, options);
      const employers = await readWithSessionRefresh(
        active.session,
        this.store,
        active.cuit,
        readEmployees,
      );
      const employer = findEmployeeByCuit(employers, options.cuit);
      if (!employer) throw new Error(`No se encontró un empleador con CUIT ${options.cuit}.`);
      await navigateWithSessionRefresh(active.session, this.store, active.cuit, (page) =>
        openEmployeeDetails(page, employer.id),
      );
      return {
        person,
        employer: toStructuredEmployeeData(await extractEmployeeData(active.session.page)),
      };
    });
  }

  formShow(options: FormOptions) {
    return this.withForm(options, async (_active, context) => context);
  }

  formSummary(options: FormOptions) {
    return this.withForm(options, async (active, context) => {
      await this.preview(active, context);
      return readFormSummary(active.session.page);
    });
  }

  formPrint(options: FormOptions & { path: string }) {
    return this.withForm(options, async (active, context) => {
      await this.preview(active, context);
      return {
        ...context,
        path: await printFormDraft(active.session.page, options.path, context.period),
      };
    });
  }

  deductionsList(options: FormOptions) {
    return this.withForm(options, async (active, context) => ({
      ...context,
      deductions: await readWithSessionRefresh(
        active.session,
        this.store,
        active.cuit,
        readDeductions,
        context,
      ),
    }));
  }

  deductionShow(options: FormOptions & { id: string }) {
    return this.withForm(options, async (active, context) => {
      await navigateWithSessionRefresh(
        active.session,
        this.store,
        active.cuit,
        openDeductionsMenu,
        context,
      );
      const deduction = await findDeductionById(active.session.page, options.id);
      if (!deduction) throw new Error(`No se encontró una deducción con ID ${options.id}.`);
      await navigateWithSessionRefresh(
        active.session,
        this.store,
        active.cuit,
        (page) => openDeductionDetail(page, deduction.editUrl, deduction.id),
        context,
      );
      return {
        ...context,
        deduction: toStructuredDeductionDetail(await extractDeductionDetail(active.session.page)),
      };
    });
  }

  addMonthlyItem(options: WriteOptions & MonthlyItem) {
    return this.mutate(options, (page) => addDeductionMonthlyItem(page, options));
  }

  addReceipt(options: WriteOptions & ReceiptItem) {
    return this.mutate(options, (page) => addDeductionReceiptItem(page, options));
  }

  removeReceipt(options: WriteOptions & RemoveReceipt) {
    return this.mutate(options, (page) => removeMedicalExpenseReceiptItem(page, options));
  }

  async close(): Promise<void> {
    this.closed = true;
    // Closing the browser also interrupts an in-flight operation on disconnect.
    if (this.activeSession) await this.closeSession(this.activeSession);
    await this.queue.catch(() => undefined);
  }

  private async preview(active: ActiveSession, context: FormContext): Promise<void> {
    await navigateWithSessionRefresh(
      active.session,
      this.store,
      active.cuit,
      openFormPreview,
      context,
    );
    await verifyFormContext(active.session.page, {
      period: context.period,
      person: context.person.id,
    });
  }

  private selectPerson(active: ActiveSession, options: PersonOptions) {
    return ensurePersonSelected(
      active.session,
      this.store,
      active.cuit,
      options.person,
      active.selectedPerson,
    );
  }

  private withForm<T>(
    options: FormOptions,
    operation: (active: ActiveSession, context: FormContext) => Promise<T>,
  ) {
    return this.withSession(async (active) => {
      const person = await this.selectPerson(active, options);
      const context = await selectFormPeriod(active.session.page, {
        period: options.period,
        person: person.name,
        selector: person.id ?? person.name,
      });
      return operation(active, context);
    });
  }

  private mutate(
    options: WriteOptions,
    operation: (page: BrowserSession["page"]) => Promise<void>,
  ) {
    if (!this.allowWrites)
      throw new Error("Las modificaciones requieren iniciar el MCP con --allow-writes.");
    return this.withForm(options, async (active, context) => {
      await verifyFormContext(active.session.page, {
        period: context.period,
        person: context.person.id,
      });
      // No automatic retry: a timed-out save may already have changed the draft.
      await operation(active.session.page);
      return {
        ...context,
        status: "draft-change-attempted",
        message:
          "Consultá las deducciones para verificar el cambio. El formulario no fue enviado al empleador.",
      };
    });
  }

  private withSession<T>(operation: (active: ActiveSession) => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      const active = await openStoredSession(this.headless, this.store, this.createBrowser);
      this.activeSession = active.session;
      try {
        if (this.closed) throw new Error("El MCP se está cerrando.");
        return await operation(active);
      } finally {
        await this.closeSession(active.session);
      }
    });
  }

  private async closeSession(session: BrowserSession): Promise<void> {
    const closing = this.closingSessions.get(session) ?? closeBrowserSession(session);
    this.closingSessions.set(session, closing);
    try {
      await closing;
    } finally {
      if (this.activeSession === session) this.activeSession = null;
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => {
      if (this.closed) throw new Error("El MCP se está cerrando.");
      return operation();
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
}
