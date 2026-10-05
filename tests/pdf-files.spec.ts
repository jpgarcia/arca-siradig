import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { resolvePdfDestination, savePdfWithUniqueName } from "../src/files/pdf.js";

test("accepts directories and explicit PDF filenames, prepares parents and explains invalid paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arca-pdf-path-"));
  try {
    expect(await resolvePdfDestination("./", "f572-2026-borrador.pdf")).toBe(
      resolve("f572-2026-borrador.pdf"),
    );
    expect(await resolvePdfDestination(dir, "f572-2026-borrador.pdf")).toBe(
      join(dir, "f572-2026-borrador.pdf"),
    );
    const folder = join(dir, "new-folder");
    expect(await resolvePdfDestination(folder, "f572-2026-borrador.pdf")).toBe(
      join(folder, "f572-2026-borrador.pdf"),
    );
    expect((await stat(folder)).isDirectory()).toBe(true);
    const filename = join(dir, "nested", "custom.PDF");
    expect(await resolvePdfDestination(filename, "default.pdf")).toBe(filename);
    expect((await stat(join(dir, "nested"))).isDirectory()).toBe(true);
    await expect(resolvePdfDestination(join(dir, "bad.txt"), "default.pdf")).rejects.toThrow(
      "extensión .pdf",
    );
    await expect(resolvePdfDestination(" ", "default.pdf")).rejects.toThrow("--path");
    await writeFile(filename, "original");
    await expect(resolvePdfDestination(`${filename}/`, "default.pdf")).rejects.toThrow(
      "es un archivo",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reserves numbered filenames atomically without overwriting existing or simultaneous downloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arca-pdf-collision-"));
  try {
    const destination = join(dir, "f572.pdf");
    await writeFile(destination, "original");
    await writeFile(join(dir, "f572 (1).pdf"), "previous");
    const paths = await Promise.all([
      savePdfWithUniqueName(Buffer.from("first"), destination),
      savePdfWithUniqueName(Buffer.from("second"), destination),
    ]);
    expect(paths.sort()).toEqual([join(dir, "f572 (2).pdf"), join(dir, "f572 (3).pdf")]);
    expect((await Promise.all(paths.map((path) => readFile(path, "utf8")))).sort()).toEqual([
      "first",
      "second",
    ]);
    expect(await readFile(destination, "utf8")).toBe("original");
    expect(await readFile(join(dir, "f572 (1).pdf"), "utf8")).toBe("previous");
    expect((await stat(paths[0])).mode & 0o777).toBe(0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
