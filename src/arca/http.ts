import type { APIRequestContext, APIResponse } from "playwright";

const WORKER_BASE_URL = "https://serviciosjava2.afip.gob.ar/radig/jsp/";
const READ_ENDPOINTS = new Set(["verMenuEmpleadores.do", "verMenuDeducciones.do"]);

export type SiradigRequestClient = {
  get: (
    url: string,
    options?: Parameters<APIRequestContext["get"]>[1],
  ) => Promise<Pick<APIResponse, "status" | "headers" | "body" | "dispose">>;
};

/** Reads only known consultation endpoints, sharing Playwright's authenticated context. */
export async function fetchSiradigJson(
  request: SiradigRequestClient,
  endpoint: string,
  variable: string,
): Promise<unknown | undefined> {
  if (!READ_ENDPOINTS.has(endpoint)) {
    throw new Error("The SiRADIG HTTP endpoint is not an allowed consultation.");
  }

  try {
    const response = await request.get(new URL(endpoint, WORKER_BASE_URL).href, {
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 15_000,
    });
    try {
      // Redirects, expired sessions, and changed formats fall back to browser navigation.
      const contentType = response.headers()["content-type"] ?? "";
      if (response.status() !== 200 || !contentType.toLowerCase().includes("text/html")) {
        return undefined;
      }
      return extractInlineJson(decodeSiradigHtml(await response.body(), contentType), variable);
    } finally {
      await response.dispose();
    }
  } catch {
    return undefined;
  }
}

export function decodeSiradigHtml(body: Uint8Array, contentType: string): string {
  const charsetPattern = /charset\s*=\s*["']?([\w-]+)/i;
  const headerCharset = contentType.match(charsetPattern)?.[1];
  const prefix = new TextDecoder().decode(body.subarray(0, 8192));
  const metaCharset = prefix.match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i)?.[1];
  return new TextDecoder(headerCharset ?? metaCharset ?? "utf-8").decode(body);
}

/** Parses JSON literals without evaluating any of the portal's JavaScript. */
export function extractInlineJson(html: string, variable: string): unknown | undefined {
  if (!/^[A-Za-z_$][\w$]*$/.test(variable)) return undefined;
  const escapedVariable = variable.replace(/\$/g, "\\$");
  const assignment = new RegExp(`\\b(?:var|let|const)\\s+${escapedVariable}\\s*=\\s*`, "g");
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const source = script[1] ?? "";
    assignment.lastIndex = 0;
    const match = assignment.exec(source);
    if (!match) continue;
    const start = assignment.lastIndex;
    if (source[start] !== "{" && source[start] !== "[") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{" || character === "[") depth += 1;
      else if (character === "}" || character === "]") {
        depth -= 1;
        if (depth === 0) {
          if (!/^\s*(?:;|$)/.test(source.slice(index + 1))) return undefined;
          try {
            return JSON.parse(source.slice(start, index + 1)) as unknown;
          } catch {
            return undefined;
          }
        }
      }
    }
  }
  return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseInlineTable(value: unknown): Array<{ id: string; cells: string[] }> | null {
  if (!isRecord(value) || !Array.isArray(value.filas)) return null;
  const rows: Array<{ id: string; cells: string[] }> = [];
  for (const row of value.filas) {
    if (
      !isRecord(row) ||
      !["string", "number"].includes(typeof row.idReg) ||
      !Array.isArray(row.celdas) ||
      !row.celdas.every((cell) => cell === null || ["string", "number"].includes(typeof cell))
    )
      return null;
    rows.push({
      id: String(row.idReg).trim(),
      cells: row.celdas.map((cell) =>
        String(cell ?? "")
          .replace(/\s+/g, " ")
          .trim(),
      ),
    });
  }
  return rows;
}
