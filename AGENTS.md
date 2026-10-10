# Instrucciones para agentes

Este proyecto implementa un CLI en TypeScript para automatizar ARCA SiRADIG con
Playwright. Admite consultas, cambios en borradores y envío de formularios con
confirmación explícita. También incluye un servidor MCP local.

## Principios

- Mantené la lógica de extracción de datos y navegación separada de las preguntas interactivas.
- No guardes CUIT/CUIL, claves fiscales, cookies ni estados de sesión sin una decisión
  explícita de producto.
- La decisión actual permite guardar el `storageState` de Playwright en
  `~/.arca-siradig/session.json` después de `arca-siradig login`; nunca guardes claves fiscales.
- Preferí funciones reutilizables en `src/arca/` para comandos sin navegador visible y el MCP.
- No ejecutes pruebas contra ARCA real salvo que el usuario lo pida explícitamente.
- Usá HTML simulado en las pruebas para validar selectores y extracción de datos.
- Usá únicamente nombres, domicilios, identificadores, importes y comprobantes ficticios
  en los datos de prueba.
- Ocultá las credenciales al manejar errores del ingreso y al formatear errores del CLI;
  no conserves como causas los errores originales que contengan credenciales.
- Los archivos de sesión y las capturas de inspección deben tener permisos privados.
  Excluí las capturas de Git y de los paquetes npm: contienen datos fiscales personales.
- Tratá `scripts/inspect-live.ts` como una herramienta de desarrollo de consulta.
  Puede navegar, aceptar recordatorios informativos y capturar HTML, pero nunca
  guardar, enviar ni editar datos en ARCA.

## Comandos de verificación

```bash
npm run build
npm run check
npm test
```

## Convenciones

- TypeScript ESM con importaciones `.js`.
- Biome para formato y análisis estático.
- El CLI usa Playwright sin mostrar el navegador de forma predeterminada. Usá
  `--headless false` para depurar con el navegador visible. Las pruebas usan el navegador oculto.
- `arca-siradig` sin argumentos debe mostrar la ayuda. Usá `--interactive` para
  el modo interactivo de consulta.
- Documentá los cambios de arquitectura en `docs/architecture.md`.
- `npm pack` debe limpiar y recompilar el código de ejecución, y publicar únicamente
  la lista de archivos permitidos de `package.json`. Nunca agregues estados de sesión,
  archivos de entorno, datos de prueba ni capturas de inspección.
- Mantené los identificadores del código, comandos, opciones y campos JSON en inglés.
  Las etiquetas de ARCA, como `Datos Personales`, conservan el texto del portal cuando
  se usan como contenido o selectores.
- Escribí la documentación, las ayudas y los mensajes al usuario en español de Argentina,
  con voseo: «Ingresá», «Elegí», «Revisá». Conservá los nombres técnicos que forman
  parte de la interfaz pública.
