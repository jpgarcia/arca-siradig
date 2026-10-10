# MCP local de SiRADIG

El paquete ofrece un servidor MCP mediante `arca-siradig mcp`, con el SDK oficial
TypeScript de MCP y transporte stdio. Se ejecuta en tu máquina, sin servidor HTTP
ni intercambio remoto de sesiones. `arca-siradig` sin argumentos sigue mostrando
la ayuda; los comandos existentes conservan opciones, formatos de salida y confirmaciones.

## Configuración

El MCP está disponible a partir de la versión 1.1.0. Hasta que se publique en npm,
usá la configuración del [repositorio local](#repositorio-local).

```bash
npx --yes --package=arca-siradig@1.1.0 playwright install chromium
npx arca-siradig@1.1.0 login
```

Configurá el cliente para ejecutar `npx -y arca-siradig@1.1.0 mcp`. El cliente
administra stdin y stdout; si ejecutás el servidor solo en una terminal, queda
esperando mensajes MCP. Usá el mismo usuario del sistema para iniciar sesión y
para ejecutar el MCP: ambos usan `~/.arca-siradig/session.json`. La configuración
MCP no contiene credenciales.

El SDK admite clientes con la inicialización anterior y con la negociación actual
del protocolo. El cliente debe admitir servidores stdio locales. Los chats web
que solo aceptan conectores alojados remotamente no pueden ejecutar este proceso.

### Claude Desktop y clientes con configuración JSON

Agregá esta entrada al objeto `mcpServers` existente:

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

La configuración de Claude Desktop está en
`~/Library/Application Support/Claude/claude_desktop_config.json` en macOS, o
`%APPDATA%\Claude\claude_desktop_config.json` en Windows. Reiniciá el cliente
cuando la modifiques. Otros clientes pueden usar otra ubicación o una interfaz
para configurar el comando y los argumentos. Consultá la
[guía oficial de servidores locales](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

### Claude Code

```bash
claude mcp add --transport stdio --scope user arca-siradig -- npx -y arca-siradig@1.1.0 mcp
claude mcp list
```

`--scope user` habilita la configuración en todos los proyectos de tu usuario.
Consultá la [documentación MCP de Claude Code](https://code.claude.com/docs/en/mcp).

### Codex

```bash
codex mcp add arca-siradig -- npx -y arca-siradig@1.1.0 mcp
codex mcp list
```

La configuración equivalente en `~/.codex/config.toml` es:

```toml
[mcp_servers.arca-siradig]
command = "npx"
args = ["-y", "arca-siradig@1.1.0", "mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 120
```

Los tiempos de espera permiten iniciar el paquete y navegar con el navegador.
Las interfaces de Codex que comparten esta configuración local pueden usar el
servidor. Esta configuración corresponde al MCP local, no a un conector web de
ChatGPT. Consultá la [documentación MCP de Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Repositorio local

```bash
npm ci
npx playwright install chromium
npm run build
node dist/src/cli/index.js login
```

Configurá el cliente con rutas absolutas al ejecutable Node y a la entrada compilada:

```json
{
  "mcpServers": {
    "arca-siradig": {
      "command": "/ruta/absoluta/a/node",
      "args": ["/ruta/absoluta/a/arca-siradig/dist/src/cli/index.js", "mcp"]
    }
  }
}
```

Buscá el ejecutable Node con `command -v node` en macOS/Linux o `where node` en
Windows. En Windows, usá las rutas correspondientes dentro del mismo formato JSON.
Volvé a ejecutar `npm run build` cuando modifiques el código y reiniciá la conexión
MCP del cliente. Si ya usás `npm link`, también podés ejecutar `arca-siradig mcp`
con la misma entrada compilada.

## Herramientas

Todas las herramientas devuelven JSON como texto y en `structuredContent`. Las
consultas de formularios incluyen el CUIT de la persona verificada y el período
fiscal real. Los IDs de selección pueden ser índices internos, como `0`; obtenelos
con `siradig_persons_list`. Los nombres de herramientas y campos JSON conservan sus
identificadores en inglés; las descripciones y los mensajes usan español.

| Herramienta | Función | Parámetros |
| --- | --- | --- |
| `siradig_session_status` | Metadatos de la sesión guardada; no autentica contra ARCA | Ninguno |
| `siradig_persons_list` | Personas disponibles para representar | Ninguno |
| `siradig_person_select` | Guardar la selección de persona sin cambiar datos fiscales | `person` |
| `siradig_personal_data` | Datos personales | `person` opcional |
| `siradig_employers_list` | Empleadores | `person` opcional |
| `siradig_employer_show` | Detalle de un empleador | `cuit`; `person` opcional |
| `siradig_form_show` | Persona y período verificados | `person` y `period` opcionales |
| `siradig_form_summary` | Vista previa oficial y totales del borrador | `person` y `period` opcionales |
| `siradig_form_print` | PDF oficial guardado localmente; devuelve la ruta absoluta | `path`; `person` y `period` opcionales |
| `siradig_deductions_list` | Deducciones con IDs y CUIT de los prestadores | `person` y `period` opcionales |
| `siradig_deduction_show` | Detalle mensual y comprobantes | `id`; `person` y `period` opcionales |
| `siradig_receipt_types` | Catálogo estático de tipos de comprobante | Ninguno |

Las consultas usan la persona guardada y el período seleccionado por ARCA si no
los indicás, y devuelven el contexto real. Indicá ambos cuando quieras consultar
un formulario concreto.

El destino del PDF puede ser un archivo o una carpeta. Los archivos tienen
permisos privados y reciben sufijos numéricos si el nombre ya existe. El PDF
queda en la máquina donde se ejecuta el MCP; para adjuntarlo o abrirlo, el chat
necesita acceso a archivos locales.

## Cambios en borradores

Agregá `--allow-writes` a los argumentos de inicio para habilitar tres herramientas
adicionales:

```json
"args": ["-y", "arca-siradig@1.1.0", "mcp", "--allow-writes"]
```

| Herramienta | Campos obligatorios |
| --- | --- |
| `siradig_deduction_add_monthly_item` | `person`, `period`, `deductionType`, `cuit`, `month`, `amount` |
| `siradig_deduction_add_receipt` | Los anteriores más `date`, `receiptType`, `number`; `reimbursedAmount` para `gastos-medicos` |
| `siradig_deduction_remove_receipt` | `person`, `period`, `cuit`, `number`; solo gastos médicos |

La IA interpreta el comprobante adjunto, revisa los campos extraídos con el usuario,
busca la deducción y el ID del tipo de comprobante, y pasa esos campos a la
herramienta. Los importes son cadenas sin separadores de miles (`"1234.56"` o
`"1234,56"`); las fechas son fechas ISO válidas (`"2026-03-15"`) que coinciden con
el mes y año solicitados. Los CUIT contienen once dígitos. Los gastos médicos
requieren indicar el reintegro, incluso cuando sea `"0"`.

Las anotaciones identifican los cambios como operaciones no idempotentes.
`--allow-writes` habilita las herramientas para todo el proceso MCP; no es una
aprobación humana por operación. El cliente administra sus propias aprobaciones.
Las llamadas completadas informan `draft-change-attempted`: volvé a consultar las
deducciones para verificar el resultado guardado. Si fallan, informan que el
resultado no pudo confirmarse. No las reintentes automáticamente, porque el
cambio podría haberse guardado.

El envío al empleador es una acción separada del CLI, con confirmación explícita:

```bash
npx arca-siradig@1.1.0 form submit --period 2026
```

Esta versión no tiene una herramienta MCP de envío. El MCP no abre preguntas del
CLI ni envía presentaciones al consultar o modificar un borrador.

## Sesiones y privacidad

El ingreso se hace desde la terminal. El MCP no tiene herramientas para recibir
claves fiscales, cookies ni estados de sesión. Lee la sesión guardada en cada
operación. Si vence, podés iniciar sesión de nuevo y repetir una consulta sin
reiniciar el servidor.

Los metadatos de sesión siempre informan `not-checked` (vigencia sin verificar).
La existencia del archivo no prueba que ARCA acepte la sesión; cada consulta
contra ARCA verifica el acceso cuando corresponde.

Las operaciones de un servidor se ejecutan en secuencia para evitar selecciones
simultáneas de persona o año. Cada navegador se cierra después de su operación.
La recuperación de consultas conserva persona y período y reintenta como máximo
una vez. Las modificaciones no tienen reintentos automáticos. Esta coordinación
aplica a un proceso, no a varios clientes o procesos CLI que compartan la sesión.

Los archivos de sesión mantienen los permisos privados del CLI. Las respuestas
exponen los datos fiscales solicitados al cliente de IA y, según su configuración,
al proveedor del modelo. Aunque la sesión quede en tu máquina, los resultados
pueden enviarse al chat. Los errores inesperados del navegador se reemplazan
por diagnósticos seguros, sin devolver encabezados, cookies ni capturas del portal.

## Resolución de problemas

- `SESSION_REQUIRED` o `SESSION_EXPIRED`: ejecutá `arca-siradig login` en la terminal
  con el mismo usuario del sistema que ejecuta el MCP y volvé a hacer la consulta.
- `PERSON_REQUIRED` o `PERSON_NOT_FOUND`: usá `siradig_persons_list` y después
  `siradig_person_select`, o indicá explícitamente el ID o nombre de la lista.
- `OPERATION_FAILED`: verificá persona y año con `arca-siradig form show --period <año>`.
  Para ver qué pasa en el navegador, agregá `--headless false` al comando del CLI.
- `DRAFT_CHANGE_UNCONFIRMED`: revisá las deducciones antes de intentar otro cambio.
- Falta el ejecutable del navegador: instalá Chromium con la misma versión del
  paquete que figura en la sección de configuración.
- No se encuentra `npx` o `node`: las aplicaciones de escritorio pueden no recibir
  el entorno del gestor de versiones de Node de tu terminal. Usá rutas absolutas
  o la configuración del repositorio local.
- Aparece la ayuda en lugar de las herramientas: agregá `mcp` a los argumentos de
  inicio del cliente. El CLI sin argumentos sigue mostrando la ayuda.

Las pruebas verifican conexiones del protocolo y HTML ficticio del portal; no
inician sesión contra ARCA real.
