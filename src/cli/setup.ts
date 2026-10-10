import { BrowserDependencyError, checkChromium, installChromium } from "../arca/browser.js";
import { promptBrowserInstallation } from "./prompts.js";

export async function runSetup(install = installChromium): Promise<void> {
  console.error("Instalando Chromium para arca-siradig. Puede tardar unos minutos...");
  await install();
  console.error("Chromium está instalado. Ya podés ejecutar `arca-siradig login`.");
}

export async function ensureLoginBrowser(
  headless: boolean,
  dependencies = {
    check: checkChromium,
    install: installChromium,
    confirm: promptBrowserInstallation,
    interactive: Boolean(process.stdin.isTTY && process.stderr.isTTY),
  },
): Promise<void> {
  try {
    await dependencies.check(headless);
    return;
  } catch (error) {
    if (!(error instanceof BrowserDependencyError)) throw error;
    if (!dependencies.interactive) throw error;
    console.error(error.message);
    if (!(await dependencies.confirm())) throw error;
  }
  await runSetup(dependencies.install);
  await dependencies.check(headless);
}
