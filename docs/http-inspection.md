# Inspección HTTP de SiRADIG

El 2026-10-03 se inspeccionó el portal autenticado de Trabajador mediante el
navegador Brave conectado. No se guardaron, enviaron ni editaron datos fiscales.
La conexión permite inspeccionar el DOM, pero no grabar el tráfico de red: estos
hallazgos provienen de la navegación visible, los atributos de formularios y los
scripts incluidos en las páginas, no de encabezados ni cuerpos HTTP capturados.
Este documento y los datos de prueba no contienen identificadores reales,
cookies, claves fiscales ni volcados de respuestas.

## Rutas de consulta observadas

Las rutas de Trabajador son relativas a
`https://serviciosjava2.afip.gob.ar/radig/jsp/`.

| Pantalla | Ruta observada | Fuente de datos |
| --- | --- | --- |
| Selección de persona | `menu_sel_empresa.jsp` | El formulario declara GET a `setearContribuyente.do`, con el campo `idContribuyente` |
| Menú de Trabajador | Menú posterior a la selección de persona | Enlaces directos a consultas |
| Datos personales | `verDatosPersonales.do?buscarEmpleado=Y` | `datosForm` incluido en la página, que completa controles inicialmente vacíos |
| Empleadores | `verMenuEmpleadores.do` | `datosEmpleadoresJSON` incluido en la página |
| Deducciones | `verMenuDeducciones.do` | `datosDeduccionesAgrupadasJSON` incluido en la página |

El enlace de empleadores apunta primero a `consultarEmpleadores.do`; la página
resultante es `verMenuEmpleadores.do`. Su JSON contiene `titulos`, `clases` y
`filas`; cada fila tiene `idReg` y cinco `celdas`.

El JSON de deducciones es una lista de grupos con `titulo`, `tipo`,
`linkAltaEdicion` y `datosTabla`. Cada tabla contiene `filas` con `idReg` y cuatro
`celdas`. JavaScript construye las tablas visibles a partir de esos datos.

## Consultas HTTP implementadas

Los listados de empleadores y deducciones usan primero `page.request.get()` sobre
la ruta observada del menú. Comparten la autenticación del contexto del navegador,
sin exportar cookies ni agregar otro almacenamiento de sesiones.

Las respuestas se leen en memoria y los datos se decodifican con `JSON.parse`.
El lector HTTP nunca ejecuta el JavaScript del portal ni cambia la página del
navegador. La página inspeccionada declara ISO-8859-1, que el navegador informa
como Windows-1252. El lector decodifica los bytes según el encabezado HTTP o la
declaración de codificación del HTML antes de leer el JSON, preservando los acentos.

Solo se admiten esas dos rutas de consulta y no se siguen redirecciones. Si hay
un error de red, una redirección, una respuesta que no es HTML, JSON ausente o un
esquema incompatible, se usa la navegación y extracción existentes del navegador.
Así, un vencimiento llega al mecanismo de recuperación de sesión del CLI. Las
respuestas se liberan después de usarlas.

Estas consultas se verifican con respuestas ficticias y páginas simuladas,
incluida la recuperación después de un vencimiento. No se verificó una solicitud
HTTP directa contra la sesión autenticada de Brave: la conexión disponible no
ofrece un cliente de solicitudes ni un grabador de tráfico.

## Pasos que siguen usando el navegador

La autenticación, la selección de persona y período, los datos personales, los
detalles y las modificaciones conservan sus flujos de navegador. Los datos
personales dependen de controles completados por scripts; los valores del HTML
inicial no alcanzan. Agregar consultas HTTP allí requiere relacionar `datosForm`
con las etiquetas existentes y comprobar que la salida sea equivalente. No se
reprodujeron solicitudes de guardado, eliminación ni envío.

## Inspección de formularios fiscales (2026-10-04)

La inspección en modo de consulta mediante Brave confirmó:

- El ingreso de Trabajador acepta `codigo=<año>`. Un año cerrado o no disponible
  devolvió `El período seleccionado es inválido o inexistente`. El año no debe
  inferirse solo de la URL; la ruta de navegación visible informa `Período <año>`.
- El menú de deducciones enlaza `#btn_vista_previa` con `vistaPreviaFormulario.do`.
- La vista previa usa HTML con tablas anidadas `table.tabla_vista_previa`, títulos
  de sección `h3`, filas oficiales de totales y subtotales, y `#tabla_datos_personales`.
- `#btn_imprimir_borrador` navega a `generarBorradorPDF.do`.
- `#btn_enviar_empleador` abre una confirmación. Al aceptarla, el controlador navega
  a `generacion_presentacion.jsp`. No se ejecutó; no se envió un formulario real.

Las pruebas con HTML simulado cubren la extracción y descarga del PDF. No se
hicieron pruebas del CLI ni envíos contra ARCA real. El historial de formularios
enviados tiene un flujo separado de la vista previa del borrador.

## Inspección del resultado de envío (2026-10-04)

El usuario ejecutó `form submit` y recibió `unconfirmed`. La inspección de
**Consulta de Formularios Enviados** mostró que la presentación estaba registrada
para el período solicitado. Durante la inspección no se generó otra presentación
y el texto de respuesta final de la generación sigue sin haberse observado.

`verFormulariosEnviados.do` contiene `#tabla_formularios`. Las filas tienen
`data-id-reg` y celdas con número público, descripción, fecha de envío, fecha de
lectura y acción de impresión. El JSON `datosFormulariosJSON` es una lista con
`codigo`, `version`, `fechaEnvio`, `fechaLectura` opcionalmente nula y `pluriempleo`.
La versión 1 es **Original**; las siguientes se muestran como
**Rectificativa <versión - 1>**. Las fechas de envío no incluyen hora: que un
registro tenga la fecha de hoy no alcanza para confirmar un envío nuevo.

El CLI consulta el historial antes de generar y, si no reconoce la confirmación,
lo compara después del único intento. Usa una página separada del mismo contexto
autenticado y verifica CUIT y período fiscal. Las consultas HTTP siguen limitadas
a los listados de empleadores y deducciones.

El historial confirma el envío solo cuando hay un ID nuevo con la versión pública
siguiente y se conservan todos los IDs anteriores. Los historiales ausentes, sin
cambios, incompatibles o ambiguos dejan el resultado sin confirmar y nunca
provocan un reenvío.
