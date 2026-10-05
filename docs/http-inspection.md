# SiRADIG HTTP inspection

Inspected the authenticated worker portal through the connected Brave browser on
2026-10-03. No tax records were saved, submitted, or edited. This browser connection
exposes DOM inspection, not a network recording API; these findings come from visible
navigation, form attributes, and inline script contents, not captured HTTP headers or
request bodies. No real identifiers, cookies, passwords, or response dumps are recorded
in this document or the fixtures.

## Observed consultation routes

All worker routes below are relative to
`https://serviciosjava2.afip.gob.ar/radig/jsp/`.

| Screen | Observed route | Data source |
| --- | --- | --- |
| Person selection | `menu_sel_empresa.jsp` | Form declares GET to `setearContribuyente.do`, field `idContribuyente` |
| Worker menu | Menu after person selection | Direct links to consultation screens |
| Personal data | `verDatosPersonales.do?buscarEmpleado=Y` | Inline `datosForm`, used to populate initially empty controls |
| Employers | `verMenuEmpleadores.do` | Inline `datosEmpleadoresJSON` |
| Deductions | `verMenuDeducciones.do` | Inline `datosDeduccionesAgrupadasJSON` |

The employer menu link initially targets `consultarEmpleadores.do`; the resulting page
is `verMenuEmpleadores.do`. Employer JSON has `titulos`, `clases`, and `filas`;
each row has `idReg` and five `celdas`. Deduction JSON is an array of groups with
`titulo`, `tipo`, `linkAltaEdicion`, and `datosTabla`. Each table has `filas` with
`idReg` and four `celdas`. JavaScript builds the displayed tables from these literals.

## Implemented HTTP path

Employer and deduction listing first use `page.request.get()` on the observed menu
endpoint. This shares the browser context's existing authentication without exporting
its cookies or adding another session store. Responses are parsed in memory, JSON
literals are decoded with `JSON.parse`, and portal JavaScript is never executed by
the HTTP reader. The request path does not navigate the browser page.
The inspected page declares ISO-8859-1 (reported as Windows-1252 by the browser);
the reader decodes response bytes using the HTTP header or HTML charset declaration
before parsing JSON, preserving accented text.

Only the two consultation routes are allowed. Redirect following is disabled. Network
failures, redirects, non-HTML responses, missing JSON, or incompatible schemas fall
back to existing browser navigation and parsing. Session expiry therefore reaches the
existing CLI refresh mechanism. Responses are disposed after use.

These HTTP reads are verified with synthetic response fixtures and mocked browser
pages, including session-expiry fallback. A direct HTTP replay against the authenticated
Brave session has not been verified: the available browser connection does not expose
a request client or network recorder.

## Remaining browser steps

Authentication, person/period selection, personal data, detail screens, and existing
mutation commands retain their browser flow. The inspected personal-data screen relies
on script-populated controls, so plain HTML control values are insufficient. Extending
HTTP support there requires matching `datosForm` to the existing field labels and
checking output parity. No save/delete/presentation request was replayed.

## Fiscal form inspection (2026-10-04)

Read-only inspection through connected Brave confirmed:

- The worker entry accepts `codigo=<year>`. A closed/unavailable year returned
  `El período seleccionado es inválido o inexistente`; a requested year must never be
  inferred solely from its URL. The visible breadcrumb reports `Período <year>`.
- The deductions menu links `#btn_vista_previa` to `vistaPreviaFormulario.do`.
- Preview is HTML with nested `table.tabla_vista_previa`, section `h3` headings,
  official total/subtotal rows, and `#tabla_datos_personales`.
- `#btn_imprimir_borrador` navigates to `generarBorradorPDF.do`.
- `#btn_enviar_empleador` opens a confirmation dialog. The confirmation handler
  navigates to `generacion_presentacion.jsp`. It was not executed; no live form was sent.

Mocked tests cover parsing and PDF download. No live CLI smoke test or presentation
was run. Historical sent forms remain a separate workflow from current draft preview.

## Submission result inspection (2026-10-04)

The user ran `form submit` and received `unconfirmed`. Read-only inspection of
**Consulta de Formularios Enviados** showed that the presentation was registered for
the requested period. No additional presentation was generated during inspection, and
the generation endpoint's final response wording remains unobserved.

`verFormulariosEnviados.do` contains `#tabla_formularios`. Rendered rows carry
`data-id-reg` and cells for the public presentation number, description, sending date,
reading date, and print action. Inline `datosFormulariosJSON` is an array with
`codigo`, `version`, `fechaEnvio`, nullable `fechaLectura`, and `pluriempleo`. Version 1
is **Original**; later versions render **Rectificativa <version - 1>**. Sending dates
have no time component, so today's date alone cannot confirm a new submission.

The CLI now reads history before generation and, if the acknowledgement is unknown,
compares it after the single generation attempt. This consultation uses a separate
authenticated browser page and verifies CUIT and fiscal year; HTTP replay remains
limited to employer and deduction list endpoints. It confirms only one new ID with the
next public version, preserving all previous IDs. Missing, unchanged, incompatible, or
ambiguous histories stay unconfirmed and never trigger a resend.
