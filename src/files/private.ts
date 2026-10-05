import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

export async function writePrivateFile(path: string, body: string | Uint8Array): Promise<void> {
  await writeFile(path, body, { flag: "wx", mode: 0o600 });
}

/** Replaces existing files atomically, including their previous permissions. */
export async function atomicWritePrivateFile(
  path: string,
  body: string | Uint8Array,
): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writePrivateFile(temporaryPath, body);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
