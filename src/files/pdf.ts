import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

export async function resolvePdfDestination(
  path: string,
  defaultFilename: string,
): Promise<string> {
  if (!path.trim() || path.includes("\0")) {
    throw new Error("--path debe indicar una carpeta o un nombre de archivo .pdf.");
  }
  const absolutePath = resolve(path);
  const info = await stat(absolutePath).catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  });
  if (info && !info.isDirectory() && /[\\/]$/.test(path)) {
    throw new Error(
      `La ruta ${absolutePath} es un archivo. Indicá una carpeta o quitá la barra final.`,
    );
  }
  const isDirectory = info?.isDirectory() || /[\\/]$/.test(path) || (!info && !extname(path));
  const destination = isDirectory ? join(absolutePath, defaultFilename) : absolutePath;
  if (extname(destination).toLowerCase() !== ".pdf") {
    throw new Error(
      "--path debe ser una carpeta o un archivo con extensión .pdf, por ejemplo ./f572.pdf.",
    );
  }
  await mkdir(dirname(destination), { recursive: true });
  return destination;
}

/** Uses exclusive creation so simultaneous downloads never overwrite one another. */
export async function savePdfWithUniqueName(body: Buffer, destination: string): Promise<string> {
  const extension = extname(destination);
  const stem = basename(destination, extension);
  for (let index = 0; ; index += 1) {
    const filename = index === 0 ? `${stem}${extension}` : `${stem} (${index})${extension}`;
    const path = join(dirname(destination), filename);
    try {
      await writeFile(path, body, { flag: "wx", mode: 0o600 });
      return path;
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
