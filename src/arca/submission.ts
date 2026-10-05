import type { Locator, Page } from "playwright";
import { type FormContext, verifyFormContext } from "./form.js";
import { findNewSubmittedForm, readSubmittedForms } from "./submitted-forms.js";

export type FormSubmissionResult = FormContext & {
  status: "submitted" | "cancelled" | "rejected" | "unconfirmed";
  message: string;
  reference?: string;
  confirmationSource?: "acknowledgement" | "sent-forms";
  submissionType?: string;
  submittedAt?: string;
  resultUrl?: string;
};

const SUCCESS_PATTERN =
  /(?:presentaci[oó]n|formulario)[^\n.]{0,80}(?:generad[oa]|enviad[oa]|presentad[oa])\s+(?:correctamente|con [eé]xito|exitosamente)/i;
const ERROR_SELECTOR = ".text-danger, .formError, .ui-state-error";
const NEGATIVE_PATTERN =
  /\bno(?:\s+(?:se|ha|sido|fue|pudo)){0,4}\s+(?:gener(?:ar|ad[oa])|envi(?:ar|ad[oa])|present(?:ar|ad[oa])|procesar|realizar)/i;

export async function submitForm(
  page: Page,
  context: FormContext,
  options: {
    accept: boolean;
    confirm?: (message: string) => Promise<boolean>;
    timeoutMs?: number;
  },
): Promise<FormSubmissionResult> {
  if (!options.accept && !options.confirm)
    throw new Error("Falta confirmar el envío del formulario.");
  const message = await openSubmissionConfirmation(page, context);
  const accepted = options.accept || (await options.confirm?.(message));
  if (!accepted) return cancelSubmission(page, context);
  return generatePresentation(page, context, options);
}

export async function openSubmissionConfirmation(
  page: Page,
  context: FormContext,
): Promise<string> {
  await verifyFormContext(page, { period: context.period, person: context.person.id });
  await page.locator("#btn_enviar_empleador").click();
  const dialog = submissionDialog(page);
  try {
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
  } catch (error) {
    const portalError = await readPortalError(page);
    if (portalError) throw new Error(`ARCA no permite enviar el formulario: ${portalError}`);
    throw error;
  }
  return page.locator("#confirmacion_generacion_presentacion").innerText();
}

export async function cancelSubmission(
  page: Page,
  context: FormContext,
): Promise<FormSubmissionResult> {
  await submissionDialog(page).getByRole("button", { name: "Cancelar", exact: true }).click();
  return {
    ...context,
    status: "cancelled",
    message: "Envío cancelado. No se generó una presentación.",
  };
}

/** The final click is attempted once. A timeout must never trigger another presentation. */
export async function generatePresentation(
  page: Page,
  context: FormContext,
  options: { timeoutMs?: number } = {},
): Promise<FormSubmissionResult> {
  await verifyFormContext(page, { period: context.period, person: context.person.id });
  const button = submissionDialog(page).getByRole("button", {
    name: "Generar Presentación",
    exact: true,
  });
  await button.waitFor({ state: "visible", timeout: 15_000 });
  const previousForms = await readSubmittedForms(page, context, options.timeoutMs).catch(
    () => null,
  );
  // Reading history can take time; bind the final action to the current preview again.
  await verifyFormContext(page, { period: context.period, person: context.person.id });
  const previewUrl = page.url();
  try {
    await button.click({ timeout: options.timeoutMs ?? 30_000 });
    await page.waitForFunction(
      ({ successPattern, negativePattern, errorSelector, previewUrl }) => {
        const text = document.querySelector<HTMLElement>("#contenido")?.innerText ?? "";
        const visibleError = Array.from(document.querySelectorAll<HTMLElement>(errorSelector)).some(
          (element) => element.getClientRects().length > 0 && element.textContent?.trim(),
        );
        return (
          new RegExp(successPattern, "i").test(text) ||
          new RegExp(negativePattern, "i").test(text) ||
          visibleError ||
          /^\s*Error\b/m.test(text) ||
          location.pathname.includes("expiredSession") ||
          location.pathname.endsWith("/login.xhtml") ||
          (location.href !== previewUrl &&
            !location.pathname.endsWith("/generacion_presentacion.jsp") &&
            document.readyState === "complete")
        );
      },
      {
        successPattern: SUCCESS_PATTERN.source,
        negativePattern: NEGATIVE_PATTERN.source,
        errorSelector: ERROR_SELECTOR,
        previewUrl,
      },
      { timeout: options.timeoutMs ?? 30_000 },
    );
    const error = await readPortalError(page);
    if (error)
      return { ...context, status: "rejected", message: `ARCA rechazó la presentación: ${error}` };
    const text = await page.locator("#contenido").innerText({ timeout: 2_000 });
    const acknowledgement = text.match(SUCCESS_PATTERN)?.[0];
    if (acknowledgement) {
      const reference = text.match(
        /(?:n[uú]mero|nro\.?|n[°º])\s*(?:de\s+)?presentaci[oó]n\s*:?\s*([\w-]+)/i,
      )?.[1];
      return {
        ...context,
        status: "submitted",
        message: acknowledgement,
        confirmationSource: "acknowledgement",
        ...(reference ? { reference } : {}),
      };
    }
  } catch {
    // The server may have processed the final click even if navigation or observation failed.
  }
  const resultUrl = new URL(page.url());
  // Strip query parameters: an unknown result should not print private URL values.
  const finalUrl = `${resultUrl.origin}${resultUrl.pathname}`;
  let historyMessage =
    "No se pudo consultar el historial antes del envío para comparar el resultado.";
  if (previousForms !== null) {
    const currentForms = await readSubmittedForms(page, context, options.timeoutMs).catch(
      () => null,
    );
    if (currentForms === null) {
      historyMessage = "No se pudo verificar el historial después del envío.";
    } else {
      const presentation = findNewSubmittedForm(previousForms, currentForms);
      if (presentation) {
        return {
          ...context,
          status: "submitted",
          message: `Presentación n.º ${presentation.number} (${presentation.description}) enviada el ${presentation.submittedAt}, confirmada en «Consulta de Formularios Enviados».`,
          reference: String(presentation.number),
          submissionType: presentation.description,
          submittedAt: presentation.submittedAt,
          confirmationSource: "sent-forms",
        };
      }
      historyMessage = currentForms.every((form) => previousForms.some((old) => old.id === form.id))
        ? "El historial no muestra una presentación nueva respecto del estado previo al envío."
        : "El historial cambió, pero no se pudo identificar una única presentación nueva de este intento.";
    }
  }
  return {
    ...context,
    status: "unconfirmed",
    resultUrl: finalUrl,
    message:
      "Se intentó generar la presentación, pero no se pudo confirmar el resultado.\n" +
      `${historyMessage}\nPantalla final: ${finalUrl}\n` +
      "Revisá «Consulta de Formularios Enviados» en ARCA antes de volver a enviar. El CLI no reintentó la presentación.",
  };
}

function submissionDialog(page: Page): Locator {
  return page
    .locator(".ui-dialog")
    .filter({ has: page.locator("#confirmacion_generacion_presentacion") });
}

async function readPortalError(page: Page): Promise<string | null> {
  return page.evaluate(
    ({ selector, negativePattern }) => {
      const error = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
        (element) => element.getClientRects().length > 0 && element.textContent?.trim(),
      );
      if (error) return error.textContent?.replace(/\s+/g, " ").trim() ?? null;
      const content = document.querySelector<HTMLElement>("#contenido")?.innerText ?? "";
      return /^\s*Error\b/m.test(content) || new RegExp(negativePattern, "i").test(content)
        ? content.replace(/\s+/g, " ").trim()
        : null;
    },
    { selector: ERROR_SELECTOR, negativePattern: NEGATIVE_PATTERN.source },
  );
}
