# ARCA SiRADIG CLI

CLI para iniciar sesión en ARCA y gestionar borradores del Formulario 572 de
**SiRADIG - Trabajador**: consultar datos personales, empleadores y deducciones;
agregar o eliminar comprobantes admitidos; ver el resumen, imprimir y enviar el
formulario al empleador.

El mismo paquete incluye un servidor MCP local para clientes de IA compatibles con
**stdio**, como Claude Desktop, Claude Code y Codex. Los comandos existentes del CLI
siguen disponibles y, si lo ejecutás sin argumentos, muestra la ayuda.

## Instalación

Usá Node.js 20.17 o superior de la rama 20.x, 22.13 o superior de la rama 22.x, o
23.5 o superior. Podés ejecutar el CLI publicado con `npx`:

```bash
npx arca-siradig --help
```

Antes de iniciar sesión por primera vez, instalá la versión de Chromium que requiere
la dependencia Playwright del CLI. El navegador queda en caché para los próximos comandos:

```bash
npx --yes --package=arca-siradig playwright install chromium
npx arca-siradig login
npx arca-siradig form summary --period 2026
```

También podés instalar el comando de forma global:

```bash
npm install --global arca-siradig
arca-siradig --help
```

Para trabajar desde el repositorio local:

```bash
npm ci
npx playwright install chromium
npm run build
```

Si querés, creá un archivo `.env` local:

```bash
ARCA_CUIT=<tu-cuit-o-cuil>
ARCA_PASSWORD=<tu-clave-fiscal>
```

Git ignora `.env` y sus variantes locales; `.env.example` contiene valores vacíos.
El CLI usa los valores configurados como predeterminados al pedir las credenciales.
La clave se muestra oculta y podés usarla presionando Enter. Preferí ingresarla
cuando el CLI te la pida. Si guardás credenciales en `.env`, mantené el archivo
privado; por ejemplo, con `chmod 600 .env` en macOS/Linux.

## MCP local para clientes de IA

El soporte MCP comienza en la versión **1.1.0**. Si todavía no está publicada en npm,
usá la configuración del [repositorio local de la guía MCP](docs/mcp.md#repositorio-local).

Instalá Chromium e iniciá sesión **desde tu terminal**, con el mismo usuario del
sistema que ejecuta el cliente de IA. El chat no necesita tu clave fiscal:

```bash
npx --yes --package=arca-siradig@1.1.0 playwright install chromium
npx arca-siradig@1.1.0 login
```

Para Claude Desktop y otros clientes que aceptan un objeto JSON `mcpServers`, agregá
esta entrada a su configuración MCP y reiniciá el cliente:

```json
{
  "mcpServers": {
    "arca-siradig": {
      "command": "npx",
      "args": ["-y", "arca-siradig@1.1.0", "mcp"]
    }
  }
}
```

Para Claude Code:

```bash
claude mcp add --transport stdio --scope user arca-siradig -- npx -y arca-siradig@1.1.0 mcp
```

Para Codex:

```bash
codex mcp add arca-siradig -- npx -y arca-siradig@1.1.0 mcp
```

El servidor permite consultar datos, seleccionar una persona, obtener el resumen
del borrador y descargar su PDF. Agregá `--allow-writes` después de `mcp` para
habilitar los cambios admitidos en borradores y la carga de comprobantes. Las
modificaciones requieren indicar la persona y el período fiscal. El envío al
empleador sigue usando la confirmación del CLI.

Ejemplo de pedido: «Mostrame mi borrador de SiRADIG de 2026 y sus deducciones.
Revisemos los campos de este comprobante antes de cargarlo». El cliente de IA
interpreta los adjuntos; el MCP recibe sus campos estructurados, no los documentos originales.

Esta integración requiere un cliente que pueda ejecutar un proceso stdio local.
Un chat web sin soporte MCP local no puede conectarse. Las sesiones quedan en tu
máquina; los datos fiscales devueltos por las herramientas son visibles para el
cliente de IA y su proveedor.

Consultá la [guía MCP](docs/mcp.md) para ver el catálogo de herramientas, la
configuración desde el repositorio y cómo resolver problemas. Los ejemplos siguen
las guías oficiales de
[Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers),
[Claude Code](https://code.claude.com/docs/en/mcp) y
[Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Uso

Los ejemplos usan `arca-siradig` directamente, después de una instalación global o
un enlace local. Si lo ejecutás con `npx`, agregá `npx` al comienzo de cada comando.

Para usar el repositorio local como un comando desde cualquier carpeta, compilalo
y creá el enlace:

```bash
npm run build
npm link
arca-siradig --help
```

Esto enlaza el paquete local sin publicarlo en npm. Volvé a ejecutar `npm run build`
cuando modifiques el código TypeScript. Un asistente local con acceso a la terminal
puede ejecutar el comando y usar la sesión creada por `arca-siradig login`, siempre
que se ejecute con el mismo usuario del sistema.

Usá `--format=json` en las consultas que lo admiten. El CLI recibe campos
estructurados de comprobantes mediante `form deductions add-item-receipt`; el
asistente debe interpretar el PDF o la imagen antes de ejecutar ese comando.

```bash
npm run arca-siradig
```

Sin argumentos, el CLI muestra la ayuda. Agregá `--help` a un comando o subcomando
para ver sus opciones, sin iniciar sesión ni ejecutar la acción:

```bash
arca-siradig login --help
arca-siradig employees show --help
arca-siradig form deductions --help
```

Playwright se ejecuta sin mostrar el navegador de forma predeterminada. Para iniciar
sesión con el navegador visible:

```bash
npm run arca-siradig -- login --headless false
```

## Comandos

Los nombres de comandos, opciones y campos JSON se mantienen en inglés para
conservar la compatibilidad. La documentación, las ayudas y los mensajes propios
del proyecto usan español de Argentina.

```bash
npm run arca-siradig -- login
npm run arca-siradig -- logout
npm run arca-siradig -- persons list
npm run arca-siradig -- persons select <id|nombre>
npm run arca-siradig -- persons list --format=json
npm run arca-siradig -- personal-data show [--person "<id|nombre>"]
npm run arca-siradig -- employees list [--person "<id|nombre>"]
npm run arca-siradig -- employees show [--person "<id|nombre>"] --employee-cuit <cuit>
npm run arca-siradig -- form deductions list [--person "<id|nombre>"]
npm run arca-siradig -- form deductions list-receipt-types
npm run arca-siradig -- form deductions show <id> [--person "<id|nombre>"]
npm run arca-siradig -- form deductions add-item --period=<AAAA> --type=<tipo> --cuit=<cuit-del-prestador> --month=<1-12> --amount=<importe>
npm run arca-siradig -- form deductions add-item-receipt --period=<AAAA> --type=<tipo> --cuit=<cuit-del-prestador> --month=<1-12> --amount=<importe> --receipt-type=<id> --date=<AAAA-MM-DD> --number=<número>
npm run arca-siradig -- form deductions add-item-receipt --period=<AAAA> --type=gastos-medicos --cuit=<cuit-del-prestador> --month=<1-12> --amount=<importe> --reimbursed-amount=<importe> --receipt-type=<id> --date=<AAAA-MM-DD> --number=<número>
npm run arca-siradig -- form deductions remove-item-receipt --period=<AAAA> --cuit=<cuit-del-prestador> --number=<número>
npm run arca-siradig -- --interactive
```

`login` pide el CUIT/CUIL y la clave fiscal si faltan. Una vez iniciada la sesión,
guarda el estado de Playwright en `~/.arca-siradig/session.json`; nunca guarda la
clave fiscal. También selecciona automáticamente la primera persona disponible en
SiRADIG y guarda esa selección. Si no hay personas disponibles, conserva la sesión
y te indica que cargues una persona en ARCA antes de continuar.

Las opciones `--cuit` y `--password` están disponibles para automatizar el ingreso.
Los argumentos con la clave pueden quedar en el historial de la terminal o en la
lista de procesos. Para iniciar sesión a mano, ingresá la clave cuando el CLI te la pida.

El ingreso usa el enlace con clave fiscal a SiRADIG publicado en
`https://www.afip.gob.ar/572web/` (`login.xhtml?action=SYSTEM&system=radig`). Si la
autenticación abre SiRADIG directamente, el CLI continúa allí. Si abre el portal de
servicios, busca SiRADIG en ese portal.

`logout` elimina el archivo de sesión guardado.

`persons list` usa la sesión guardada. Si no existe o venció en ARCA, volvé a ejecutar
`arca-siradig login`. La salida predeterminada es texto; usá `--format=json` para
obtener JSON.

`persons select` acepta el ID o nombre que aparece en `persons list`.

`personal-data show`, `employees list`, `employees show`, `form deductions list` y
`form deductions show` usan la sesión y la persona seleccionada. Podés indicar
otra persona con `--person`. Los cinco comandos admiten `--format=text|json`.

`employees list` y `form deductions list` consultan primero el JSON incluido en las
páginas del portal mediante solicitudes HTTP autenticadas. `employees show` usa el
mismo mecanismo para buscar el empleador. Esto reduce la navegación del navegador.
Si ARCA cambia la respuesta o la sesión vence, el CLI usa la navegación con
Playwright. El ingreso y la selección de persona siguen usando el navegador.

`form deductions list-receipt-types` muestra el catálogo fijo `cmpTipo` del portal.
La salida de texto es una tabla `ID`/`Tipo`; la salida JSON contiene objetos `{ id, name }`.

`form deductions show <id>` busca la deducción en la lista agrupada y abre el detalle
del registro en modo de consulta. La salida de texto refleja la pantalla de ARCA,
con entidad, período, detalle mensual y comprobantes. El JSON conserva campos en
inglés, con meses, importes y fechas normalizados e IDs numéricos de tipos de comprobante.

`form deductions add-item` y `form deductions add-item-receipt` identifican la
deducción por tipo y CUIT del prestador. Para deducciones con detalle mensual, usá
el tipo y CUIT que aparecen en la misma fila de `form deductions list`.

`form deductions add-item-receipt --type=gastos-medicos` carga un comprobante por
CUIT del prestador y mes. Si ya existe un registro para ese prestador y mes, lo abre;
si no, abre `verGastosMedicos.do`, completa el CUIT, selecciona el mes, agrega el
comprobante y guarda el borrador.

`form deductions remove-item-receipt` elimina comprobantes de `gastos-medicos` por
CUIT del prestador y número. Revisa todos los registros de ese prestador, elimina
la fila del comprobante que coincide y guarda el borrador.

## Formularios fiscales

```bash
arca-siradig form show --period 2026 --format=json
arca-siradig form deductions list --period 2026 --format=json
arca-siradig form summary --period 2026
arca-siradig form summary --period 2026 --format=json
arca-siradig form print --period 2026 --path ./f572-2026.pdf
arca-siradig form print --period 2026 --path ./
```

Todos los comandos de formularios admiten `--person <id|nombre>` y, si lo omitís,
usan la persona guardada. Las consultas pueden omitir `--period`: informan el
período fiscal que ARCA tiene seleccionado, sin asumir que sea el último. Si
indicás un período, el CLI lo selecciona desde el ingreso de Trabajador y verifica
el año en la ruta de navegación visible del portal. Si el período no está disponible,
la consulta falla. Estos comandos acceden al borrador actual del formulario; las
presentaciones históricas tienen un flujo separado.

`form show` informa persona y período. `form summary` lee la vista previa HTML
oficial del borrador: carácter de la presentación, agente de retención, tablas de
las secciones y totales informados por ARCA. Conserva los importes y etiquetas del
portal sin recalcular impuestos ni topes deducibles. El resumen en consola destaca
los totales y agrupa importes mensuales por categoría y prestador. Las secciones
vacías se muestran de forma compacta. Los colores se habilitan en terminales y se
desactivan si redirigís la salida o configurás `NO_COLOR`.

`form print` usa la descarga oficial **Imprimir Borrador** y valida que el archivo
sea un PDF. `--path` acepta un nombre de archivo PDF o una carpeta: `./`, una
carpeta existente, una ruta terminada en `/` o una ruta nueva sin extensión. Para
carpetas, el nombre predeterminado es `f572-<año>-borrador.pdf`. Crea las carpetas
necesarias y agrega ` (1)`, ` (2)`, etc. antes de la extensión si el nombre ya
existe, incluso cuando indicás un archivo explícito. Los archivos tienen permisos
privados y no se sobrescriben. El CLI siempre informa la ruta absoluta del archivo guardado.

Los cambios (`add-item`, `add-item-receipt`, `remove-item-receipt`) requieren
`--period`. La fecha del comprobante debe corresponder a ese año. El CLI verifica
persona y período antes de modificar un formulario. Si recupera una sesión durante
una consulta, restaura ambos antes de volver a navegar.

El JSON de `form deductions list` tiene la forma
`{ period, person: { id, name }, deductions: [...] }`; el detalle usa
`{ period, person: { id, name }, deduction: {...} }`. La salida de texto incluye
persona y año. El catálogo estático de tipos de comprobante conserva su salida y
no acepta un período.

### Envío al empleador

```bash
arca-siradig form submit --period 2026
arca-siradig form submit --period 2026 --aceptar
arca-siradig form submit --period 2026 --aceptar --format=json
```

`form submit` muestra el resumen oficial del borrador, abre la confirmación de ARCA
y te pide elegir **Aceptar — Generar Presentación** o **Cancelar** desde la terminal.
La opción predeterminada es cancelar; si interrumpís la pregunta, también cancela.
`--aceptar` omite esa pregunta y confirma **Generar Presentación** directamente.
El envío siempre requiere `--period` y admite `--person`. Si no hay una terminal
interactiva, requiere `--aceptar`.

El CLI vuelve a verificar persona y año justo antes del clic final y nunca lo
reintenta automáticamente. El resultado usa los estados `submitted` (enviado),
`cancelled` (cancelado), `rejected` (rechazado) o `unconfirmed` (sin confirmar).
Para confirmar el éxito, requiere un mensaje positivo de ARCA o una presentación
nueva registrada en el historial.

Si no reconoce el mensaje final, consulta **Consulta de Formularios Enviados** y
compara con una captura en memoria tomada justo antes del clic. Verifica persona
y período y exige un único registro nuevo con el número de presentación siguiente.
Una presentación que ya existía nunca confirma el envío. La confirmación por
historial incluye número, descripción y fecha de envío.

Si ninguno de los mecanismos confirma el resultado, revisá ese historial en ARCA
antes de volver a enviar. El mensaje incluye la URL final sin parámetros y el
motivo por el que el historial no pudo confirmar el intento. Los resultados
rechazados o sin confirmar terminan con código 1. El resumen y la pregunta se
escriben en stderr para que el resultado JSON sea un único objeto en stdout.

La confirmación y el resultado se prueban con HTML simulado. Una inspección en
modo de consulta verificó el historial después de un envío realizado por el
usuario con el CLI; durante el desarrollo no se generó otra presentación real.

## Modo interactivo

Ejecutá el modo interactivo de consulta con:

```bash
npm run arca-siradig -- --interactive
```

El flujo:

1. Pide CUIT/CUIL y clave fiscal.
2. Inicia sesión en ARCA.
3. Vuelve a pedir las credenciales si ARCA las rechaza.
4. Abre el servicio `SiRADIG - Trabajador`.
5. Acepta automáticamente el recordatorio sobre borradores si aparece.
6. Lista las personas disponibles para representar.
7. Selecciona una persona para esa sesión del navegador; no guarda la selección.
8. Muestra el menú principal con las acciones deshabilitadas salvo `Datos Personales`.
9. Muestra los datos personales agrupados por sección.

## Comandos de desarrollo

```bash
npm run build
npm run check
npm run format
npm test
```

## Inspección durante el desarrollo

Para investigar cambios en el HTML del portal o nuevas funciones de consulta, usá:

```bash
npx tsx scripts/inspect-live.ts
```

La herramienta abre Chromium visible, usa las credenciales de `.env`, recorre el
flujo de Trabajador en modo de consulta y guarda resúmenes HTML y capturas en una
carpeta con nombre aleatorio dentro del directorio temporal del sistema. Informa
la ruta aunque la inspección falle. En macOS/Linux, la carpeta se crea con permisos
`0700` y los archivos con `0600`.

Las capturas incluyen datos fiscales personales. Mantenelas privadas, eliminalas
cuando termines y usá datos ficticios en las pruebas en lugar de copiar respuestas
reales. Ejecutá inspecciones contra ARCA únicamente cuando el usuario lo solicite.

## Limitaciones

- Las modificaciones admiten detalles mensuales y comprobantes; los comprobantes
  de gastos médicos también se pueden eliminar.
- `form submit` envía la presentación al empleador después de confirmar, o con `--aceptar`.
- El menú interactivo solo tiene habilitada la opción `Datos Personales`.
- Las pruebas usan HTML simulado y no inician sesión en ARCA real.
- `logout` elimina la sesión guardada; las sesiones de navegador que ya están
  abiertas siguen activas.

## Privacidad y contenido del paquete

El archivo de sesión contiene CUIT/CUIL, la selección de persona y el estado
autenticado del navegador. Tratalo como una credencial. El CLI nunca agrega la
clave fiscal a ese archivo. Las escrituras reemplazan el archivo de forma atómica
con permisos `0600`; al leer un archivo antiguo, se corrigen sus permisos y los
de la carpeta (`0700`) en macOS/Linux. Los errores del ingreso y del CLI ocultan
las claves, incluso en los registros de Playwright con caracteres escapados.

La salida de consola, el JSON y los PDFs contienen los datos fiscales solicitados.
Git ignora los PDFs con nombres predeterminados, las copias de sesión, las carpetas
de inspección, las variantes locales de archivos de entorno y los archivos del
paquete npm. Revisá las rutas de exportación personalizadas antes de hacer un
commit. Todas las pruebas versionadas usan datos e identificadores ficticios.

`npm pack` ejecuta una compilación limpia mediante `prepack`. El paquete contiene
solo JavaScript y declaraciones del código de ejecución, `package.json`, README,
LICENSE y `docs/mcp.md`. Excluye pruebas, herramientas de desarrollo, archivos de
entorno y mapas de código fuente. Podés revisar el contenido con:

```bash
npm pack --dry-run
```

## Licencia

[ISC](LICENSE). El archivo conserva el texto original de la licencia e incluye una
traducción informativa al español.
