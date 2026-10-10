import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { BrowserDependencyError, installChromium } from "../src/arca/browser.js";
import { parseCliOptions } from "../src/cli/options.js";
import { ensureLoginBrowser } from "../src/cli/setup.js";

const missing = () => Promise.reject(new BrowserDependencyError());

test("login offers installation only when Chromium is missing and verifies it afterwards", async () => {
  const calls: string[] = [];
  await ensureLoginBrowser(true, {
    check: async (headless) => {
      expect(headless).toBe(true);
      calls.push("check");
      if (calls.length === 1) throw new BrowserDependencyError();
    },
    confirm: async () => {
      calls.push("confirm");
      return true;
    },
    install: async () => {
      calls.push("install");
    },
    interactive: true,
  });
  expect(calls).toEqual(["check", "confirm", "install", "check"]);
});

test("available Chromium never prompts or installs", async () => {
  await ensureLoginBrowser(false, {
    check: async (headless) => {
      expect(headless).toBe(false);
    },
    confirm: async () => {
      throw new Error("No debe preguntar");
    },
    install: async () => {
      throw new Error("No debe instalar");
    },
    interactive: true,
  });
});

for (const interactive of [true, false]) {
  test(`missing Chromium cancels safely (interactive=${interactive})`, async () => {
    let prompted = false;
    await expect(
      ensureLoginBrowser(true, {
        check: missing,
        confirm: async () => {
          prompted = true;
          return false;
        },
        install: async () => {
          throw new Error("No debe instalar");
        },
        interactive,
      }),
    ).rejects.toThrow("arca-siradig setup");
    expect(prompted).toBe(interactive);
  });
}

test("runtime errors do not trigger downloads", async () => {
  await expect(
    ensureLoginBrowser(true, {
      check: async () => {
        throw new Error("Falta una biblioteca del sistema");
      },
      confirm: async () => {
        throw new Error("No debe preguntar");
      },
      install: async () => {
        throw new Error("No debe instalar");
      },
      interactive: true,
    }),
  ).rejects.toThrow("Falta una biblioteca del sistema");
});

test("installer uses its own CLI identity under npx and reports a failed subprocess", async () => {
  const directory = await mkdtemp(join(tmpdir(), "siradig-setup-"));
  try {
    const cache = join(directory, "_npx", "package with spaces");
    await mkdir(cache, { recursive: true });
    const cli = join(cache, "cli.cjs");
    await writeFile(
      cli,
      'if (process.argv[1].includes("_npx") || process.argv.slice(2).join(" ") !== "install chromium" || process.env.ARCA_PASSWORD || process.env.ARCA_CUIT) process.exit(9);',
    );
    await installChromium(cli);
    await writeFile(cli, "process.exit(1);");
    await expect(installChromium(cli)).rejects.toThrow("No se pudo instalar Chromium");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("login without a browser exits before asking for credentials or opening ARCA", async () => {
  const directory = await mkdtemp(join(tmpdir(), "siradig-missing-browser-"));
  try {
    const entry = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));
    const result = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", entry, "login"],
      {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: directory, NO_COLOR: "1" },
      },
    ).then(
      () => {
        throw new Error("El login debería fallar");
      },
      (error) => error,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("arca-siradig setup");
    expect(result.stderr).not.toContain("CUIT/CUIL:");
    expect(result.stdout).not.toContain("Ingresando a ARCA");
    expect(result.stderr).not.toContain("Executable doesn't exist");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("setup rejects unrelated flags and arguments", () => {
  expect(parseCliOptions(["setup"])).toEqual({ kind: "setup" });
  for (const args of [
    ["setup", "extra"],
    ["setup", "--password", "ficticia"],
    ["setup", "--interactive"],
  ]) {
    expect(() => parseCliOptions(args)).toThrow("sin opciones");
  }
});
