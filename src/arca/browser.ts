import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

export class BrowserDependencyError extends Error {
  readonly code = "BROWSER_REQUIRED";
  constructor() {
    super(
      "Falta Chromium para esta versión de arca-siradig. Ejecutá `arca-siradig setup` (o `npx arca-siradig setup`) y volvé a intentar.",
    );
    this.name = "BrowserDependencyError";
  }
}

export async function launchChromium(headless: boolean) {
  try {
    return await chromium.launch({ headless });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Executable doesn't exist")) {
      throw new BrowserDependencyError();
    }
    throw error;
  }
}

/** Probe the requested browser mode without navigating or reading a session. */
export async function checkChromium(headless: boolean): Promise<void> {
  const browser = await launchChromium(headless);
  await browser.close();
}

/** Use the CLI shipped with our Playwright dependency, never a separately resolved npx package. */
export async function installChromium(
  cliPath = join(
    dirname(createRequire(import.meta.url).resolve("playwright/package.json")),
    "cli.js",
  ),
): Promise<void> {
  // Give the dependency's CLI our own command identity. Its npx heuristic otherwise
  // warns about project dependencies even though this package already includes them.
  const bootstrap =
    'const cli = process.argv[1]; process.argv = [process.execPath, "arca-siradig setup", "install", "chromium"]; require(cli);';
  const env = { ...process.env };
  delete env.ARCA_PASSWORD;
  delete env.ARCA_CUIT;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", bootstrap, cliPath], {
      stdio: "inherit",
      env,
      shell: false,
    });
    child.once("error", () =>
      reject(
        new Error("No se pudo iniciar la instalación. Ejecutá `arca-siradig setup` de nuevo."),
      ),
    );
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            "No se pudo instalar Chromium. Revisá tu conexión y los permisos de la caché de Playwright, y ejecutá `arca-siradig setup` de nuevo.",
          ),
        );
    });
  });
}
