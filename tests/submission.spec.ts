import { expect, test } from "@playwright/test";
import type { FormContext } from "../src/arca/form.js";
import { submitForm } from "../src/arca/submission.js";
import { findNewSubmittedForm, type SubmittedForm } from "../src/arca/submitted-forms.js";
import { parseCliOptions } from "../src/cli/options.js";

const base = "https://serviciosjava2.afip.gob.ar/radig/jsp/";
const context: FormContext = { period: 2026, person: { id: "20000000001", name: "SAMPLE PERSON" } };
const header = `<table id="encabezado_usuario"><tr><th>Representando a:</th>
  <td id="person">20000000001 - SAMPLE PERSON</td></tr></table>
  <div id="breadCrumb0">Vista Previa | Período 2026</div>`;
const preview = `${header}<div id="contenido">Vista Previa</div>
  <a id="btn_enviar_empleador" href="#" onclick="document.getElementById('dialog').hidden=false;return false">Enviar al Empleador...</a>
  <div id="dialog" class="ui-dialog" hidden>
    <div id="confirmacion_generacion_presentacion">¿Está seguro de que desea generar una presentación?</div>
    <button onclick="location.href='generacion_presentacion.jsp'">Generar Presentación</button>
    <button onclick="document.getElementById('dialog').hidden=true">Cancelar</button>
  </div>`;

const original: SubmittedForm = {
  id: "1001",
  number: 1,
  description: "Original",
  submittedAt: "15/03/2026",
};
const rectification: SubmittedForm = {
  id: "1002",
  number: 2,
  description: "Rectificativa 1",
  submittedAt: "04/10/2026",
};

function history(forms: SubmittedForm[], formHeader = header): string {
  return `${formHeader}<table id="tabla_formularios"><thead><tr>
    <th>Presentación</th><th>Descripción</th><th>Fecha de Envío</th>
    <th>Fecha de Lectura (Agente Retención)</th><th></th></tr></thead><tbody>
    ${forms.map((form) => `<tr data-id-reg="${form.id}"><td>${form.number}</td><td>${form.description}</td><td>${form.submittedAt}</td><td>-</td><td></td></tr>`).join("")}
    </tbody></table><script>var datosFormulariosJSON = ${JSON.stringify(forms.map((form) => ({ codigo: Number(form.id), version: form.number, fechaEnvio: form.submittedAt, fechaLectura: null, pluriempleo: "N" })))};</script>`;
}

test.beforeEach(async ({ context: browserContext }) => {
  // History uses another page in the same context; intercept it as well as the draft.
  await browserContext.route(`${base}verFormulariosEnviados.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: history([]) }),
  );
});

test("parses explicit submission acceptance and requires its fiscal year", () => {
  expect(parseCliOptions(["form", "submit", "--period", "2026"])).toEqual({
    kind: "form-submit",
    headless: true,
    person: undefined,
    period: 2026,
    accept: false,
    format: "text",
  });
  expect(
    parseCliOptions([
      "form",
      "submit",
      "--period=2026",
      "--aceptar",
      "--person=0",
      "--format=json",
    ]),
  ).toMatchObject({ kind: "form-submit", person: "0", period: 2026, accept: true, format: "json" });
  expect(() => parseCliOptions(["form", "submit", "--aceptar"])).toThrow("--period is required");
  expect(() => parseCliOptions(["form", "summary", "--aceptar"])).toThrow(
    "only supported for form submit",
  );
  expect(() => parseCliOptions(["form", "deductions", "add-item", "--aceptar"])).toThrow(
    "only supported for form submit",
  );
  expect(parseCliOptions(["form", "submit", "--help"])).toMatchObject({
    kind: "help",
    topic: "form",
  });
});

test("default flow asks for acceptance and cancellation never generates a presentation", async ({
  page,
}) => {
  let requests = 0;
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
  );
  await page.route(`${base}generacion_presentacion.jsp`, (route) => {
    requests += 1;
    return route.abort();
  });
  await page.goto(`${base}vistaPreviaFormulario.do`);
  let confirmations = 0;
  const result = await submitForm(page, context, {
    accept: false,
    confirm: async (message) => {
      confirmations += 1;
      expect(message).toContain("generar una presentación");
      return false;
    },
  });
  expect(result.status).toBe("cancelled");
  expect(confirmations).toBe(1);
  expect(requests).toBe(0);
  await expect(page.locator("#dialog")).toBeHidden();
});

for (const accept of [false, true]) {
  test(`confirms the portal dialog once and reports an acknowledged result (automatic=${accept})`, async ({
    page,
  }) => {
    let requests = 0;
    let confirmations = 0;
    await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
    );
    await page.route(`${base}generacion_presentacion.jsp`, (route) => {
      requests += 1;
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `${header}<div id="contenido">El formulario fue enviado correctamente. Nro. de presentación: MOCK-001</div>`,
      });
    });
    await page.goto(`${base}vistaPreviaFormulario.do`);
    const result = await submitForm(page, context, {
      accept,
      timeoutMs: 1_000,
      confirm: async () => {
        confirmations += 1;
        return true;
      },
    });
    expect(result).toMatchObject({ ...context, status: "submitted", reference: "MOCK-001" });
    expect(confirmations).toBe(accept ? 0 : 1);
    expect(requests).toBe(1);
  });
}

test("fails before the final click if the represented person changes during confirmation", async ({
  page,
}) => {
  let requests = 0;
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
  );
  await page.route(`${base}generacion_presentacion.jsp`, (route) => {
    requests += 1;
    return route.abort();
  });
  await page.goto(`${base}vistaPreviaFormulario.do`);
  await expect(
    submitForm(page, context, {
      accept: false,
      confirm: async () => {
        await page.locator("#person").evaluate((element) => {
          element.textContent = "20000000002 - OTHER PERSON";
        });
        return true;
      },
    }),
  ).rejects.toThrow("persona diferente");
  expect(requests).toBe(0);
});

test("rejects a wrong fiscal year before opening the submission dialog", async ({ page }) => {
  await page.setContent(preview);
  await expect(submitForm(page, { ...context, period: 2025 }, { accept: true })).rejects.toThrow(
    "se solicitó 2025",
  );
  await expect(page.locator("#dialog")).toBeHidden();
});

test("reports ARCA validation failures without retrying the final click", async ({ page }) => {
  let requests = 0;
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
  );
  await page.route(`${base}generacion_presentacion.jsp`, (route) => {
    requests += 1;
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${header}<div id="contenido"><p class="text-danger">Falta designar un agente de retención.</p></div>`,
    });
  });
  await page.goto(`${base}vistaPreviaFormulario.do`);
  const result = await submitForm(page, context, { accept: true, timeoutMs: 1_000 });
  expect(result.status).toBe("rejected");
  expect(result.message).toContain("Falta designar un agente");
  expect(requests).toBe(1);
});

test("does not claim success or resend after an unrecognized result", async ({ page }) => {
  let requests = 0;
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
  );
  await page.route(`${base}generacion_presentacion.jsp`, (route) => {
    requests += 1;
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${header}<div id="contenido">Procesando presentación...</div>`,
    });
  });
  await page.goto(`${base}vistaPreviaFormulario.do`);
  const result = await submitForm(page, context, { accept: true, timeoutMs: 300 });
  expect(result.status).toBe("unconfirmed");
  expect(result.message).toContain("Consulta de Formularios Enviados");
  expect(requests).toBe(1);
});

test("does not mistake a negative acknowledgement for success", async ({ page }) => {
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: preview,
    }),
  );
  await page.route(`${base}generacion_presentacion.jsp`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${header}<div id="contenido">El formulario no fue enviado correctamente.</div>`,
    }),
  );
  await page.goto(`${base}vistaPreviaFormulario.do`);
  const result = await submitForm(page, context, { accept: true, timeoutMs: 1_000 });
  expect(result.status).toBe("rejected");
  expect(result.message).toContain("no fue enviado correctamente");
});

test("only identifies a single next presentation with a new record ID", () => {
  expect(findNewSubmittedForm([original], [rectification, original])).toEqual(rectification);
  expect(findNewSubmittedForm([], [original])).toEqual(original);
  expect(findNewSubmittedForm([original, rectification], [rectification, original])).toBeNull();
  expect(findNewSubmittedForm([original], [rectification])).toBeNull();
  expect(findNewSubmittedForm([original], [original, { ...rectification, number: 3 }])).toBeNull();
  expect(
    findNewSubmittedForm(
      [original],
      [original, rectification, { ...rectification, id: "1003", number: 3 }],
    ),
  ).toBeNull();
});

for (const firstPresentation of [false, true]) {
  test(`confirms a new history record even without a success phrase (first=${firstPresentation})`, async ({
    page,
    context: browserContext,
  }) => {
    let generated = false;
    let generationRequests = 0;
    let historyRequests = 0;
    const newForm = firstPresentation ? original : rectification;
    const previous = firstPresentation ? [] : [original];
    await browserContext.route(`${base}verFormulariosEnviados.do`, (route) => {
      historyRequests += 1;
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: history(generated ? [newForm, ...previous] : previous),
      });
    });
    await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
    );
    await page.route(`${base}generacion_presentacion.jsp`, (route) => {
      generationRequests += 1;
      generated = true;
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `${header}<div id="contenido">Operación finalizada.</div>`,
      });
    });
    await page.goto(`${base}vistaPreviaFormulario.do`);
    const result = await submitForm(page, context, { accept: true, timeoutMs: 1_000 });
    expect(result).toMatchObject({
      ...context,
      status: "submitted",
      reference: String(newForm.number),
      submissionType: newForm.description,
      submittedAt: newForm.submittedAt,
      confirmationSource: "sent-forms",
    });
    expect(result.message).toContain("Consulta de Formularios Enviados");
    expect(generationRequests).toBe(1);
    expect(historyRequests).toBe(2);
    expect(browserContext.pages()).toEqual([page]);
  });
}

test("an old presentation from the same day never confirms a new attempt", async ({
  page,
  context: browserContext,
}) => {
  let requests = 0;
  await browserContext.route(`${base}verFormulariosEnviados.do`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: history([original, rectification]),
    }),
  );
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
  );
  await page.route(`${base}generacion_presentacion.jsp`, (route) => {
    requests += 1;
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${header}<div id="contenido">Operación finalizada.</div>`,
    });
  });
  await page.goto(`${base}vistaPreviaFormulario.do`);
  const result = await submitForm(page, context, { accept: true, timeoutMs: 1_000 });
  expect(result.status).toBe("unconfirmed");
  expect(result.message).toContain("no muestra una presentación nueva");
  expect(result.resultUrl).toBe(`${base}generacion_presentacion.jsp`);
  expect(requests).toBe(1);
});

for (const mismatch of ["person", "period", "multiple", "unavailable"] as const) {
  test(`does not confirm history with ${mismatch} after the final click`, async ({
    page,
    context: browserContext,
  }) => {
    let generated = false;
    let requests = 0;
    await browserContext.route(`${base}verFormulariosEnviados.do`, (route) => {
      if (generated && mismatch === "unavailable") return route.abort();
      const formHeader = !generated
        ? header
        : mismatch === "person"
          ? header.replace("20000000001", "20000000002")
          : mismatch === "period"
            ? header.replace("2026", "2025")
            : header;
      const forms = generated
        ? mismatch === "multiple"
          ? [original, rectification, { ...rectification, id: "1003", number: 3 }]
          : [original, rectification]
        : [original];
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: history(forms, formHeader),
      });
    });
    await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
    );
    await page.route(`${base}generacion_presentacion.jsp`, (route) => {
      requests += 1;
      generated = true;
      return route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `${header}<div id="contenido">Operación finalizada.</div>`,
      });
    });
    await page.goto(`${base}vistaPreviaFormulario.do`);
    const result = await submitForm(page, context, { accept: true, timeoutMs: 1_000 });
    expect(result.status).toBe("unconfirmed");
    expect(result.message).toContain(
      mismatch === "multiple" ? "única presentación" : "No se pudo verificar el historial",
    );
    expect(requests).toBe(1);
    expect(browserContext.pages()).toEqual([page]);
  });
}

test("does not attribute existing history to this attempt if the baseline was unavailable", async ({
  page,
  context: browserContext,
}) => {
  let historyRequests = 0;
  await browserContext.route(`${base}verFormulariosEnviados.do`, (route) => {
    historyRequests += 1;
    return route.abort();
  });
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
  );
  await page.route(`${base}generacion_presentacion.jsp`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `${header}<div id="contenido">Procesado</div>`,
    }),
  );
  await page.goto(`${base}vistaPreviaFormulario.do`);
  const result = await submitForm(page, context, { accept: true, timeoutMs: 1_000 });
  expect(result.status).toBe("unconfirmed");
  expect(result.message).toContain("No se pudo consultar el historial antes del envío");
  expect(historyRequests).toBe(1);
});

test("reverifies the preview after consulting history and before the final click", async ({
  page,
  context: browserContext,
}) => {
  let requests = 0;
  await browserContext.route(`${base}verFormulariosEnviados.do`, async (route) => {
    await page.locator("#person").evaluate((element) => {
      element.textContent = "20000000002 - OTHER PERSON";
    });
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: history([]) });
  });
  await page.route(`${base}vistaPreviaFormulario.do`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: preview }),
  );
  await page.route(`${base}generacion_presentacion.jsp`, (route) => {
    requests += 1;
    return route.abort();
  });
  await page.goto(`${base}vistaPreviaFormulario.do`);
  await expect(submitForm(page, context, { accept: true, timeoutMs: 1_000 })).rejects.toThrow(
    "persona diferente",
  );
  expect(requests).toBe(0);
});
