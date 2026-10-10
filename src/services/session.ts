import type { Page } from "playwright";
import { type FormContext, selectFormPeriod } from "../arca/form.js";
import {
  acceptReminderModal,
  acceptReminderModalIfPresent,
  listPersons,
  selectPerson,
} from "../arca/persons.js";
import {
  ARCA_LOGIN_URL,
  ARCA_PORTAL_URL,
  type BrowserSession,
  createBrowserSession,
  isExpiredPortalSessionUrl,
  openSiradigFromPortal,
  SIRADIG_BASE_URL,
} from "../arca/session.js";
import type { SessionStore, StoredSession } from "../session/store.js";
import type { Person } from "../types.js";

export const PERSON_SELECTION_URL =
  "https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp";

export class SessionError extends Error {
  constructor(
    public readonly code:
      | "SESSION_REQUIRED"
      | "SESSION_EXPIRED"
      | "PERSON_REQUIRED"
      | "PERSON_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

export async function openStoredSession(
  headless: boolean,
  store: SessionStore,
  createBrowser = createBrowserSession,
) {
  const stored = await store.read();
  if (!stored) {
    throw new SessionError(
      "SESSION_REQUIRED",
      "No hay una sesión guardada. Ejecutá `arca-siradig login`.",
    );
  }
  return {
    cuit: stored.cuit,
    selectedPerson: stored.selectedPerson ?? null,
    session: await createBrowser({ headless, storageState: stored.storageState }),
  };
}

export async function isLoginPage(page: Page): Promise<boolean> {
  if (page.url().startsWith(ARCA_LOGIN_URL)) return true;
  // SiRADIG forms contain numeric inputs too; a spinbutton there is not a login.
  if (page.url().startsWith(SIRADIG_BASE_URL)) return false;
  return page.getByRole("spinbutton").first().isVisible();
}

function expiredSession(): SessionError {
  return new SessionError("SESSION_EXPIRED", "La sesión expiró. Ejecutá `arca-siradig login`.");
}

export async function openPersonSelectionPage(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
  allowRefresh = true,
): Promise<void> {
  await navigateWithSessionRefresh(
    session,
    store,
    cuit,
    (page) => page.goto(PERSON_SELECTION_URL, { waitUntil: "domcontentloaded" }),
    undefined,
    allowRefresh,
  );
}

export async function ensurePersonSelected(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
  personIdentifier: string | undefined,
  storedSelectedPerson: StoredSession["selectedPerson"],
  allowRefresh = true,
): Promise<Person> {
  const target = personIdentifier || storedSelectedPerson?.id || storedSelectedPerson?.name;
  if (!target) {
    throw new SessionError(
      "PERSON_REQUIRED",
      [
        "No hay una persona seleccionada.",
        "Ejecutá:",
        "- `arca-siradig persons list` para ver las personas disponibles y luego",
        "- `arca-siradig persons select <id|nombre>`.",
      ].join("\n"),
    );
  }
  await openPersonSelectionPage(session, store, cuit, allowRefresh);
  await acceptReminderModalIfPresent(session.page);
  const persons = await listPersons(session.page);
  if (!persons.length) {
    throw new SessionError(
      "PERSON_NOT_FOUND",
      "No se pudieron listar personas. Ejecutá `arca-siradig login`.",
    );
  }
  const selected = persons.find((person) => person.id === target || person.name === target);
  if (!selected)
    throw new SessionError("PERSON_NOT_FOUND", `No se encontró la persona "${target}".`);
  await selectPerson(session.page, selected.id ?? selected.name);
  await acceptReminderModal(session.page, { timeoutMs: 5_000 });
  await saveSelectedPersonSession(store, cuit, session, selected);
  return selected;
}

export async function saveSelectedPersonSession(
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

/** Only repeat consultations/navigation here. Never pass a draft mutation or submission. */
export async function navigateWithSessionRefresh(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
  navigate: (page: Page) => Promise<unknown>,
  formContext?: FormContext,
  allowRefresh = true,
): Promise<void> {
  const visit = async () => {
    try {
      const value = await navigate(session.page);
      if (value && typeof value === "object" && "url" in value && "goto" in value) {
        session.page = value as Page;
      }
    } catch (error) {
      if (await isLoginPage(session.page)) throw expiredSession();
      // A parser may fail before it can report the portal's expiry redirect.
      if (!isExpiredPortalSessionUrl(session.page.url())) throw error;
    }
    if (await isLoginPage(session.page)) throw expiredSession();
  };
  await visit();
  if (!isExpiredPortalSessionUrl(session.page.url())) return;
  if (!allowRefresh) throw expiredSession();

  const selectedPerson = (await store.read())?.selectedPerson;
  await session.page.goto(ARCA_PORTAL_URL, { waitUntil: "domcontentloaded" });
  if (await isLoginPage(session.page)) throw expiredSession();
  session.page = await openSiradigFromPortal(session.page);
  await saveSelectedPersonSession(store, cuit, session, selectedPerson);
  if (formContext || selectedPerson) {
    const restored = await ensurePersonSelected(
      session,
      store,
      cuit,
      undefined,
      selectedPerson ?? { id: null, name: formContext?.person.name ?? "" },
      false,
    );
    if (formContext) {
      await selectFormPeriod(session.page, {
        period: formContext.period,
        person: formContext.person.id,
        selector: restored.id ?? restored.name,
      });
    }
  }
  await visit();
  if (isExpiredPortalSessionUrl(session.page.url())) throw expiredSession();
}

export async function readWithSessionRefresh<T>(
  session: BrowserSession,
  store: SessionStore,
  cuit: string,
  read: (page: Page) => Promise<T>,
  formContext?: FormContext,
): Promise<T> {
  let result: { value: T } | undefined;
  await navigateWithSessionRefresh(
    session,
    store,
    cuit,
    async (page) => {
      result = { value: await read(page) };
    },
    formContext,
  );
  // A successful navigation always completes the read, including after a refresh.
  if (!result) throw new Error("La consulta no devolvió un resultado.");
  return result.value;
}
