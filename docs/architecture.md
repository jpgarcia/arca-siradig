# Arquitectura actual

## Descripción general

El paquete ofrece un CLI por comandos, un modo interactivo opcional y un servidor
MCP local. Comparten Playwright y la gestión de sesiones; las preguntas interactivas
quedan en el CLI. `arca-siradig` sin argumentos muestra la ayuda y `arca-siradig mcp`
atiende mensajes por stdio.

## Módulos

- `src/cli/`: análisis de argumentos, ejecución de comandos, preguntas interactivas
  y presentación en consola.
- `src/mcp/`: servidor con el SDK oficial de MCP, esquemas de herramientas,
  anotaciones, resultados estructurados y ciclo de vida de stdio. Se carga únicamente
  cuando el CLI ejecuta `mcp`.
- `src/services/session.ts`: lectura de la sesión guardada, selección de persona,
  errores tipados con instrucciones de recuperación y renovación de sesiones de
  consulta, compartidos por CLI y MCP.
- `src/services/siradig.ts`: consultas y cambios en borradores para MCP, sin preguntas
  interactivas, con ejecución secuencial por proceso y cierre del navegador.
- `src/services/structured-output.ts`: conversión compartida de datos. El módulo
  anterior del CLI reexporta estas funciones para conservar la compatibilidad de importación.
- `src/cli/help.ts`: ayudas declarativas y presentación compartida de tablas alineadas,
  descripciones ajustadas al ancho y ejemplos multilínea que se pueden copiar en la terminal.
- `src/files/pdf.ts`: validación del destino del PDF, nombres predeterminados para
  carpetas y creación exclusiva con sufijos numéricos, sin sobrescribir documentos.
- `src/files/private.ts`: creación privada de archivos y carpetas, y reemplazo
  atómico de archivos sensibles.
- `src/security/errors.ts`: ocultamiento de secretos literales, escapados como JSON
  o codificados como URL en los diagnósticos.
- `src/cli/errors.ts`: formato de errores del CLI, ocultando claves pasadas por
  argumentos o configuradas en el entorno.
- `src/arca/session.ts`: creación de navegador, contexto y página; ingreso y apertura de SiRADIG.
- `src/arca/http.ts`: consultas HTTP autenticadas limitadas a rutas permitidas y
  lectura del JSON incluido en HTML sin ejecutar los scripts del portal. Comparte
  el contexto de solicitudes de Playwright.
- `src/arca/persons.ts`: recordatorios, listado y selección de personas.
- `src/arca/form.ts`: verificación de contexto fiscal, extracción de la vista previa
  oficial y descarga del PDF.
- `src/arca/submission.ts`: confirmación del portal, cancelación, generación de la
  presentación en un solo intento y clasificación conservadora del resultado.
- `src/arca/submitted-forms.ts`: consulta del historial de formularios enviados y
  comparación de IDs y versiones antes y después del envío.
- `src/arca/menu.ts`: listado del menú principal y selección de `Datos Personales`.
- `src/arca/personal-data.ts`: extracción de datos personales agrupados.
- `src/arca/employees.ts`: extracción de empleadores, navegación y detalle.
- `src/arca/receipt-types.ts`: catálogo fijo `cmpTipo` para los tipos de comprobante.
- `src/session/store.ts`: persistencia local del `storageState` de Playwright en
  `~/.arca-siradig/session.json`.
- `src/types.ts`: contratos internos compartidos.
- `scripts/inspect-live.ts`: herramienta de inspección en modo de consulta para
  recopilar HTML del portal durante el desarrollo.

## Flujo

1. El CLI muestra la ayuda o ejecuta el comando solicitado: ingreso, personas,
   datos personales, empleadores, formularios, deducciones, MCP o modo interactivo.
   `--help` tiene prioridad sobre la ejecución, el modo interactivo y los argumentos
   obligatorios. La ayuda de los subcomandos no necesita sesión ni abre un navegador.
2. `login` pide las credenciales faltantes, abre SiRADIG, selecciona la primera
   persona disponible y guarda el `storageState` de Playwright junto con esa selección.
3. Los comandos de personas usan la sesión guardada y muestran texto o JSON.
4. `--interactive` carga `.env` y pide credenciales con valores predeterminados opcionales.
5. Se crea una sesión Chromium de Playwright sin mostrar el navegador, salvo que
   se indique `--headless false`.
6. El ingreso comienza en `login.xhtml?action=SYSTEM&system=radig`, el enlace con
   clave fiscal publicado en el micrositio oficial `https://www.afip.gob.ar/572web/`.
   Después de enviar el CUIT/CUIL, espera el paso de clave fiscal o un error visible
   de ARCA. Después de enviar la clave, espera SiRADIG, el portal autenticado o un error.
   Si llega directamente a SiRADIG, continúa allí. Si llega al portal, busca la
   etiqueta visible completa SiRADIG - Trabajador en enlaces, botones o tarjetas,
   ignorando duplicados ocultos y diferencias de mayúsculas o guiones. Conserva la
   página devuelta, incluso si se abre una ventana nueva. Si el servicio no está
   visible, expande `Ver Todos`.
   El ingreso espera la pantalla de selección de persona antes de navegar a otra
   ruta durante la autenticación del servicio. Una pantalla inesperada falla antes
   de guardar la sesión, en lugar de interpretarse como una lista vacía.
   Si la apertura del servicio o la selección de persona termina en Empleador
   (`/radig_emp/`), navega al ingreso de Trabajador
   `determinarContribuyente.do?codigo=<año-actual>` con la misma sesión. Espera el
   menú o selector, vuelve a seleccionar la persona cuando corresponde y limita
   la recuperación a un intento. Solo se admite el flujo de Trabajador (`/radig/`).
7. Extrae las personas de `input.btn_empresa`.
8. Extrae los grupos de campos de datos personales y del detalle del empleador
   dentro de `#contenido`, y los muestra.
9. Extrae empleadores de `#nueva_tabla_empleadores` y abre sus detalles en modo de
   consulta con `verEmpleador.do?id=...`. El listado y la búsqueda previa al detalle
   leen primero `datosEmpleadoresJSON` por HTTP; si falla, usan el navegador.
10. Extrae deducciones de `#div_tabla_deducciones_agrupadas` y determina el tipo a
    partir de la URL de edición de cada grupo. El listado lee primero
    `datosDeduccionesAgrupadasJSON` por HTTP, conservando el esquema de salida y la
    correspondencia de tipos. Si falla, usa la extracción desde el navegador.
11. `form deductions list-receipt-types` muestra el catálogo fijo `cmpTipo` del portal.
12. `form deductions show` busca el registro en la lista agrupada, abre su detalle
    por ID y extrae entidad, período, detalle mensual y comprobantes del DOM.
    El JSON usa IDs numéricos de tipos de comprobante; el texto conserva la etiqueta del portal.
13. `form deductions add-item` y el flujo habitual de `add-item-receipt` buscan el
    registro por tipo y CUIT del prestador, usan los diálogos de
    `verCuotasMedicoAsistenciales.do` y terminan con el botón `Guardar` de la página,
    después de agregar el detalle mensual o comprobante.
14. `form deductions add-item-receipt --type=gastos-medicos` busca primero un
    registro del mismo prestador y mes. Si no existe, abre `verGastosMedicos.do`,
    completa el CUIT, selecciona el mes, agrega el comprobante con el reintegro
    indicado y guarda el borrador.
15. `form deductions remove-item-receipt` admite `gastos-medicos` por CUIT del
    prestador y número de comprobante. Revisa los registros que coinciden,
    elimina la fila correspondiente y guarda el borrador.

## Ayudas e idioma del CLI

Todos los temas usan la misma estructura y las funciones de `src/cli/help.ts`.
La sintaxis y los argumentos comparten una columna; las descripciones se alinean
en otra, igual para comandos, opciones del comando y opciones generales. El
espaciado se calcula sobre texto sin estilos, antes de aplicar colores ANSI.

La presentación usa el ancho de la terminal, o 100 columnas cuando la salida está
redirigida. Las descripciones continúan debajo de su columna. Si no entran dos
columnas, muestra etiqueta y descripción en líneas separadas. Los ejemplos se
cortan entre argumentos con barras invertidas de continuación, para poder
copiarlos en la terminal. Los nombres de opciones y sus valores nunca se cortan por la mitad.

Las ayudas describen las opciones admitidas por el analizador. `--interactive`
inicia el modo de consulta y `--headless <true|false>` controla la visibilidad del
navegador. Las opciones no admitidas `--debug` y `--version` no se anuncian. La
selección de persona requiere un ID o nombre posicional; el detalle de empleador
requiere `--employee-cuit`.

La documentación, las ayudas, las preguntas, las indicaciones de teclado y los
mensajes propios del proyecto usan español de Argentina con voseo. Los comandos,
opciones, nombres de herramientas y campos JSON conservan sus identificadores
para mantener la compatibilidad. Los selectores y textos extraídos de ARCA
conservan el contenido del portal. El texto legal original de ISC se acompaña con
una traducción informativa en `LICENSE`.

## Contexto fiscal y vista previa

`form` agrupa las operaciones por período fiscal, con las deducciones dentro de
`form deductions`. Las consultas informan la persona representada y el período
real. Las modificaciones requieren `--period` explícito y admiten `--person`.
La fecha del comprobante debe corresponder al año solicitado. Los comandos de
datos personales y empleadores mantienen su interfaz.

`selectFormPeriod` lee la persona de `#encabezado_usuario` y el año de
`#breadCrumb0`. Si se pide otro año, navega a
`determinarContribuyente.do?codigo=<año>`, resuelve el selector de persona si
aparece y verifica ambos datos después. El ID del selector puede ser un índice
interno como `0`, no un CUIT. El CLI usa el nombre de la persona para la primera
verificación del encabezado y conserva el ID para volver a seleccionarla.
Después de verificarlo, mantiene el CUIT del encabezado como referencia durante
los cambios de período y la recuperación de sesión.

Los errores de identidad muestran la persona esperada y la encontrada, el año
y los comandos para revisar o cambiar la selección. La URL por sí sola no prueba
el período seleccionado. Un período no disponible o un contexto incorrecto fallan
antes de modificar datos. Los reintentos de consulta después de un vencimiento
vuelven a seleccionar persona y año.

`form show` informa ese contexto. `form summary` abre `vistaPreviaFormulario.do`
y lee `#contenido`: títulos oficiales, filas directas de tablas anidadas
`tabla_vista_previa`, totales con la etiqueta `Importe Total`, carácter de la
presentación y agente de retención. Excluye los contenedores de tablas anidadas
para evitar filas duplicadas.

Cada sección informa si contiene datos reales mediante celdas finales o filas
de subtotales. Esto permite resumir secciones vacías en consola y conservar las
tablas completas en JSON. `src/cli/render.ts` agrupa totales, categorías,
prestadores y detalles mensuales, con ajuste al ancho y colores opcionales. No
calcula totales ni topes fiscales. El resumen corresponde al borrador, incluso
si su carácter es rectificativo.

`form print --path` hace clic en `#btn_imprimir_borrador` y espera la descarga de
Playwright. Verifica la firma `%PDF-`, resuelve el destino con `src/files/pdf.ts`,
crea un archivo nuevo con permisos `0600` y elimina la descarga temporal del
navegador. Para carpetas usa `f572-<año>-borrador.pdf`; si el nombre existe, agrega
` (1)`, ` (2)`, etc. La creación exclusiva evita colisiones entre descargas
simultáneas. Crea las carpetas necesarias y siempre informa la ruta absoluta
cuando guarda el archivo. El controlador inspeccionado usa `generarBorradorPDF.do`.

El botón de envío abre `#confirmacion_generacion_presentacion`; su confirmación
navega a `generacion_presentacion.jsp`. `form submit --period <año>` usa ese
flujo del navegador. El CLI muestra el resumen y pasa a `submitForm` una función
de confirmación de `src/cli/prompts.ts`; la navegación no depende de preguntas
interactivas. La confirmación cancela de forma predeterminada y también cancela
si se interrumpe la pregunta.

`--aceptar` confirma directamente el diálogo del portal y solo se admite en ese
comando. La ejecución sin terminal requiere esa opción explícita. Justo antes
de generar la presentación se vuelven a verificar persona y período.

La preparación de consulta puede recuperar la sesión. La generación final no se
reintenta. Si la respuesta tarda demasiado o su formato es desconocido, se
intenta verificar el historial; si no alcanza para confirmar, devuelve `unconfirmed`.

Antes del clic final, una página separada del mismo contexto autenticado consulta
`verFormulariosEnviados.do`. Verifica persona y período y lee las filas de
`#tabla_formularios`, con `data-id-reg`, número público de presentación,
descripción y fecha de envío. Así conserva la vista previa y su diálogo. Después
de esa consulta, vuelve a verificar el contexto de la vista previa antes de generar.

Los mensajes positivos explícitos confirman el éxito; los errores visibles o
mensajes negativos confirman el rechazo. Si el texto final es desconocido, una
consulta de historial puede confirmar el envío cuando todos los registros
anteriores siguen presentes y hay exactamente un ID nuevo con el número siguiente.
Los registros antiguos, múltiples agregados, contextos distintos, historial no
disponible o falta de una captura previa dejan el resultado sin confirmar.

El resultado confirmado por historial incluye `confirmationSource: "sent-forms"`,
el número público en `reference`, `submissionType` y `submittedAt`. Si queda sin
confirmar, incluye la URL final sin parámetros y explica por qué el historial no
pudo confirmarlo. No reintenta la generación. Las capturas del historial se mantienen
en memoria y nunca se guardan.

Una inspección en modo de consulta verificó que el envío anterior del usuario
con el CLI estaba registrado, aunque no se reconoció su respuesta final. Durante
el desarrollo no se generó otra presentación real. Las pruebas con HTML simulado
cubren los mensajes y la confirmación por historial. Los resultados rechazados o
sin confirmar terminan con código 1. El resumen y las preguntas van a stderr;
stdout queda disponible para un único resultado JSON.

## Privacidad y compilación del paquete

`loginToArca` intercepta errores donde se usan las credenciales. Oculta CUIT y
clave fiscal, incluidas las variantes escapadas como JSON en registros de
Playwright, y crea un error nuevo sin conservar la causa original. El rechazo de
credenciales mantiene el tipo `ArcaLoginError`.

El formato de errores del CLI también oculta todas las claves pasadas por
argumentos y la configurada en el entorno. Los errores de análisis de opciones
no repiten sus valores ni la lista completa de argumentos. `--password` sigue
disponible; ingresarla mediante una pregunta evita registrarla en el historial
o en los argumentos del proceso.

La sesión guarda únicamente los campos aprobados. La carpeta usa permisos `0700`.
Se escribe un temporal con nombre único y permisos `0600`, y luego se reemplaza
`session.json` de forma atómica. Esto corrige permisos antiguos y evita JSON
parcialmente escrito. La lectura también corrige permisos. Estos modos aplican
a macOS/Linux; en Windows la protección depende de los controles de acceso del
sistema de archivos.

La inspección usa las mismas funciones de ingreso y apertura del portal. Sus
capturas son material de desarrollo con datos reales, no datos de prueba para
compartir. Cada ejecución crea una carpeta temporal privada con nombre aleatorio
e informa la ruta antes de abrir el navegador. Los archivos HTML, JSON y capturas
se crean exclusivamente con permisos privados. Todas las pruebas versionadas
usan nombres, domicilios, identificadores e importes ficticios.

La configuración TypeScript de desarrollo verifica código de ejecución, pruebas
y herramientas de inspección. `scripts/build.mjs` realiza esa verificación,
elimina la salida anterior y compila únicamente el código de ejecución con
`tsconfig.build.json`, sin mapas de código fuente. Marca la entrada del CLI como
ejecutable para que los enlaces de `npm link` sigan funcionando después de
recompilar. `prepack` ejecuta esta compilación limpia.

La lista de archivos permitidos incluye JavaScript y declaraciones de ejecución,
README, LICENSE y `docs/mcp.md`; npm también incluye `package.json`. No se publican
pruebas ni sus datos compilados, herramientas de desarrollo, archivos de entorno,
mapas de código fuente ni capturas de inspección.

## MCP local

La [guía MCP](mcp.md) describe la instalación, la configuración de clientes y las
herramientas. El ejecutable agrega el subcomando `mcp`, conservando los comandos,
formatos de salida y confirmación del CLI. La sesión aprobada se comparte con MCP;
el ingreso sigue haciéndose desde la terminal.

El SDK oficial administra la negociación del protocolo y los mensajes stdio.
stdout contiene únicamente mensajes del protocolo. Los errores de herramientas
devuelven instrucciones para recuperar la sesión o diagnósticos seguros; nunca
errores crudos del navegador. El SDK valida esquemas estrictos antes de ejecutar
las operaciones: fechas de comprobantes, año y mes, formato de CUIT, importes y
reintegros. Las pruebas conectan el cliente oficial con la inicialización anterior
y la negociación actual. Los mensajes de validación de Zod usan su configuración
regional en español, cargada al iniciar el MCP.

Las doce herramientas predeterminadas cubren metadatos, personas, datos personales,
empleadores, contexto fiscal, resumen y PDF oficiales, y consultas de deducciones.
La selección de persona actualiza la selección local existente. La descarga de
PDF crea un archivo privado nuevo y se identifica como una escritura local.

`--allow-writes` expone tres herramientas adicionales de cambios en borradores.
Sus esquemas requieren persona y período fiscal y marcan las modificaciones como
no idempotentes. El guardado se intenta una vez y después corresponde consultar
el borrador para verificar el resultado. Habilitar herramientas es un consentimiento
para el proceso completo; la aprobación de cada operación depende del cliente.
El envío al empleador sigue usando exclusivamente la confirmación del CLI.

Las operaciones de un mismo servicio MCP se ejecutan en una cola. Cada una carga
la sesión más reciente, crea un navegador y lo cierra en `finally`. La desconexión
o el cierre del servidor cierra el navegador activo y rechaza el trabajo pendiente.
La recuperación de consultas conserva persona y período, incluso cuando falla
la extracción porque aparece una pantalla de sesión vencida. Ninguna modificación
se pasa a la función de reintento de consulta o navegación.

La cola no coordina procesos MCP o CLI separados. El MCP nunca devuelve cookies
de sesión ni claves predeterminadas, pero los datos fiscales solicitados son
visibles para el cliente de IA conectado. `src/version.ts` comparte la versión
entre la ayuda del CLI y el servidor MCP.

## Extensiones futuras

La [inspección HTTP](http-inspection.md) registra rutas observadas, esquemas JSON,
límites de verificación y pasos del navegador pendientes de investigar. Si una
consulta HTTP falla, se vuelve a la navegación para conservar la recuperación
de sesión existente.

Los comandos nuevos deben seguir usando funciones de `src/arca/` detrás de una
capa pequeña de ejecución del CLI. La sesión ya usa `storageState` persistido;
las nuevas consultas deberían componerse sobre esa base antes de introducir
mecanismos de autenticación adicionales.

Los identificadores del código se mantienen en inglés. Las etiquetas de ARCA
conservan el español cuando forman parte del contenido visible, los selectores
o el vocabulario del portal. La documentación y los mensajes del proyecto se
escriben en español de Argentina.
