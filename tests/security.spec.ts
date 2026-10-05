import { execFile } from "node:child_process";
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { loginToArca, SIRADIG_LOGIN_URL } from "../src/arca/session.js";
import { formatCliError } from "../src/cli/errors.js";
import { parseCliOptions } from "../src/cli/options.js";
import { ensurePrivateDirectory, writePrivateFile } from "../src/files/private.js";
import { safeErrorMessage } from "../src/security/errors.js";
import { createSessionStore } from "../src/session/store.js";

test("CLI parse errors omit credential values, including unknown option assignments", () => {
  const secret = "synthetic-audit-password";
  for (const args of [
    ["--password", secret],
    [`--password=${secret}`],
    ["login", `--pasword=${secret}`],
  ]) {
    expect(() => parseCliOptions(args)).toThrow();
    try {
      parseCliOptions(args);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  }
});

test("error formatting redacts repeated literal, escaped and encoded passwords", () => {
  const secret = 'synthetic-"password\\with\nspaces ?';
  const error = new Error(
    `Timeout: fill(${JSON.stringify(secret)})\n${secret}\n${encodeURIComponent(secret)}\n${secret}`,
  );
  const message = safeErrorMessage(error, [secret]);
  expect(message).toContain("Timeout: fill(");
  expect(message.match(/\[REDACTED\]/g)).toHaveLength(4);
  expect(message).not.toContain("synthetic");
  expect(safeErrorMessage("plain diagnostic", [undefined, ""])).toBe("plain diagnostic");
});

test("CLI errors redact every password argument and the environment default", () => {
  const error = new Error("default-secret / first-secret / second-secret");
  expect(
    formatCliError(
      error,
      ["--password", "first-secret", "--password=second-secret"],
      "default-secret",
    ),
  ).toBe("[REDACTED] / [REDACTED] / [REDACTED]");
});

test("the actual CLI does not echo a password when the command is missing", async () => {
  const secret = "synthetic-cli-password";
  const result = await promisify(execFile)(process.execPath, [
    "--import",
    "tsx",
    "src/cli/index.ts",
    "--password",
    secret,
  ]).catch((error: { code: number; stdout: string; stderr: string }) => error);
  expect("code" in result && result.code).toBe(1);
  expect(result.stderr).toContain("Unknown command: (missing)");
  expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
});

test("login strips credentials from a real Playwright fill failure", async ({ page }) => {
  const cuit = "20000000001";
  const password = 'synthetic-"escaped\\password';
  page.setDefaultTimeout(500);
  page.setDefaultNavigationTimeout(3_000);
  await page.route(SIRADIG_LOGIN_URL, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<input type="number"><button>Siguiente</button>
        <input type="password" readonly><button>Ingresar</button>`,
    }),
  );
  const error = await loginToArca(page, { cuit, password }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toContain("[REDACTED]");
  expect(String(error)).not.toContain("synthetic");
  expect((error as Error).cause).toBeUndefined();
});

test("session writes replace permissive files and persist only approved fields", async () => {
  test.skip(process.platform === "win32", "POSIX file permissions");
  const dir = await mkdtemp(join(tmpdir(), "arca-private-session-"));
  const store = createSessionStore(dir);
  try {
    await chmod(dir, 0o755);
    await writeFile(store.path, "old contents", { mode: 0o644 });
    const input = {
      cuit: "20000000001",
      createdAt: "2026-01-01T00:00:00.000Z",
      storageState: { cookies: [], origins: [] },
      password: "synthetic-unapproved-password",
    };
    await store.write(input);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    expect(await readdir(dir)).toEqual(["session.json"]);
    const text = await readFile(store.path, "utf8");
    expect(text).not.toContain("password");
    expect(JSON.parse(text).storageState).toEqual(input.storageState);
    expect((await store.read())?.cuit).toBe(input.cuit);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reading a legacy session repairs its directory and file permissions", async () => {
  test.skip(process.platform === "win32", "POSIX file permissions");
  const dir = await mkdtemp(join(tmpdir(), "arca-legacy-session-"));
  const store = createSessionStore(dir);
  try {
    await store.write({
      cuit: "20000000001",
      createdAt: "2026-01-01T00:00:00.000Z",
      storageState: { cookies: [], origins: [] },
    });
    await chmod(dir, 0o755);
    await chmod(store.path, 0o644);
    expect(await store.read()).not.toBeNull();
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspection artifacts are private at creation and cannot overwrite files", async () => {
  test.skip(process.platform === "win32", "POSIX file permissions");
  const dir = await mkdtemp(join(tmpdir(), "arca-inspection-files-"));
  const path = join(dir, "snapshot.html");
  try {
    await chmod(dir, 0o755);
    await ensurePrivateDirectory(dir);
    await writePrivateFile(path, Buffer.from("synthetic capture"));
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(writePrivateFile(path, "replacement")).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(path, "utf8")).toBe("synthetic capture");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
