import { chmod, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BrowserContextOptions } from "playwright";
import { atomicWritePrivateFile, ensurePrivateDirectory } from "../files/private.js";
import type { SelectedPerson } from "../types.js";

export type StoredSession = {
  cuit: string;
  createdAt: string;
  selectedPerson?: SelectedPerson | null;
  storageState: NonNullable<BrowserContextOptions["storageState"]>;
};

export type SessionStore = {
  read: () => Promise<StoredSession | null>;
  write: (session: StoredSession) => Promise<void>;
  clear: () => Promise<void>;
  path: string;
};

export function createSessionStore(baseDir = join(homedir(), ".arca-siradig")): SessionStore {
  const path = join(baseDir, "session.json");

  return {
    path,
    read: async () => {
      try {
        await chmod(baseDir, 0o700);
        await chmod(path, 0o600);
        const content = await readFile(path, "utf8");
        return JSON.parse(content) as StoredSession;
      } catch (error) {
        if (isMissingFileError(error)) {
          return null;
        }

        throw error;
      }
    },
    write: async (session) => {
      await ensurePrivateDirectory(baseDir);
      const { cuit, createdAt, selectedPerson, storageState } = session;
      await atomicWritePrivateFile(
        path,
        `${JSON.stringify({ cuit, createdAt, selectedPerson, storageState }, null, 2)}\n`,
      );
    },
    clear: async () => {
      await rm(path, { force: true });
    },
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
