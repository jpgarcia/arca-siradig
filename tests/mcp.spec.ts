import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { expect, test } from "@playwright/test";
import { BrowserDependencyError } from "../src/arca/browser.js";
import type { BrowserSession } from "../src/arca/session.js";
import { parseCliOptions } from "../src/cli/options.js";
import { createMcpServer } from "../src/mcp/server.js";
import { SiradigService } from "../src/services/siradig.js";
import type { SessionStore, StoredSession } from "../src/session/store.js";

function memoryStore(stored: StoredSession | null = null): SessionStore {
  return {
    path: "synthetic-session.json",
    read: async () => stored,
    write: async (value) => {
      stored = value;
    },
    clear: async () => {
      stored = null;
    },
  };
}

async function connect(service: SiradigService, allowWrites = false) {
  const server = createMcpServer({ service, allowWrites });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "synthetic-test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await service.close();
    },
  };
}

test("MCP is opt-in and leaves bare CLI and interactive commands unchanged", () => {
  expect(parseCliOptions([])).toEqual({ kind: "help", headless: true, topic: "root" });
  expect(parseCliOptions(["--interactive"])).toEqual({ kind: "interactive", headless: true });
  expect(parseCliOptions(["mcp"])).toEqual({ kind: "mcp", headless: true, allowWrites: false });
  expect(parseCliOptions(["mcp", "--allow-writes", "--headless=false"])).toEqual({
    kind: "mcp",
    headless: false,
    allowWrites: true,
  });
  expect(() => parseCliOptions(["login", "--allow-writes"])).toThrow("solo se admite con mcp");
  expect(() => parseCliOptions(["mcp", "--password=synthetic-secret"])).toThrow(
    "Opción no admitida para mcp: --password",
  );
  expect(() => parseCliOptions(["mcp", "--period=2026"])).toThrow(
    "Opción no admitida para mcp: --period",
  );
  expect(() => parseCliOptions(["mcp", "extra"])).toThrow("Usá arca-siradig mcp");
});

for (const mode of ["legacy", "auto"] as const) {
  test(`the actual CLI serves MCP over stdio (${mode}) without console noise or ARCA access`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "arca-mcp-test-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)),
        fileURLToPath(new URL("../src/cli/index.ts", import.meta.url)),
        "mcp",
      ],
      cwd: dir,
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const client = new Client(
      { name: "synthetic-stdio-client", version: "1.0.0" },
      { versionNegotiation: { mode } },
    );
    const errors: Error[] = [];
    client.onerror = (error) => {
      errors.push(error);
    };
    try {
      await client.connect(transport);
      expect(client.getNegotiatedProtocolVersion()).toBe(
        mode === "auto" ? "2026-07-28" : "2025-11-25",
      );
      const tools = (await client.listTools()).tools;
      expect(tools).toHaveLength(12);
      expect(tools.some((tool) => /login|password|submit|add_receipt/.test(tool.name))).toBe(false);
      const result = await client.callTool({ name: "siradig_receipt_types", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        receiptTypes: expect.arrayContaining([{ id: "6", name: "Factura B" }]),
      });
      expect(errors).toEqual([]);
      expect(stderr).toBe("");
    } finally {
      await client.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("missing session gives an actionable MCP result without launching a browser", async () => {
  const service = new SiradigService({
    store: memoryStore(),
    createBrowser: async () => {
      throw new Error("Browser must not launch");
    },
  });
  const connection = await connect(service);
  try {
    const status = await connection.client.callTool({
      name: "siradig_session_status",
      arguments: {},
    });
    expect(status.structuredContent).toMatchObject({
      savedSession: false,
      authentication: "missing",
    });
    const result = await connection.client.callTool({
      name: "siradig_form_show",
      arguments: { period: 2026 },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "SESSION_REQUIRED" });
    expect(JSON.stringify(result)).toContain("arca-siradig login");
  } finally {
    await connection.close();
  }
});

test("session metadata and unexpected errors never disclose stored credentials", async () => {
  const secret = "synthetic-session-cookie";
  const service = new SiradigService({
    store: memoryStore({
      cuit: "20000000001",
      createdAt: "2026-01-01T00:00:00Z",
      storageState: {
        cookies: [
          {
            name: "session",
            value: secret,
            domain: "example.invalid",
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
    }),
    createBrowser: async () => {
      throw new Error(`Cookie: ${secret}`);
    },
  });
  const connection = await connect(service);
  try {
    const status = await connection.client.callTool({
      name: "siradig_session_status",
      arguments: {},
    });
    expect(status.structuredContent).toMatchObject({
      savedSession: true,
      authentication: "not-checked",
    });
    const failure = await connection.client.callTool({
      name: "siradig_persons_list",
      arguments: {},
    });
    expect(failure.isError).toBe(true);
    expect(JSON.stringify([status, failure])).not.toMatch(
      /synthetic-session-cookie|20000000001|storageState|Cookie:/,
    );
    const invalid = await connection.client.callTool({
      name: "siradig_session_status",
      arguments: { password: secret },
    });
    expect(invalid.isError).toBe(true);
    expect(JSON.stringify(invalid)).not.toContain(secret);
  } finally {
    await connection.close();
  }
});

test("draft tools are enabled explicitly and validate fiscal context and receipt fields before execution", async () => {
  const service = new SiradigService({ store: memoryStore(), allowWrites: true });
  const calls: object[] = [];
  service.addReceipt = async (input) => {
    calls.push(input);
    return {
      period: input.period,
      person: { id: "20000000001", name: "SAMPLE PERSON" },
      status: "draft-change-attempted",
      message: "Synthetic save",
    };
  };
  const connection = await connect(service, true);
  const input = {
    person: "0",
    period: 2026,
    deductionType: "gastos-medicos",
    cuit: "30000000001",
    month: 3,
    amount: "1234.56",
    reimbursedAmount: "0",
    receiptType: "6",
    date: "2026-03-15",
    number: "0000100000001",
  };
  try {
    const tools = (await connection.client.listTools()).tools;
    expect(tools).toHaveLength(15);
    expect(
      tools.find((tool) => tool.name === "siradig_deduction_add_receipt")?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
    const invalidInputs = [
      { ...input, person: undefined },
      { ...input, period: undefined },
      { ...input, date: "2025-03-15" },
      { ...input, date: "2026-02-30" },
      { ...input, month: 4 },
      { ...input, reimbursedAmount: undefined },
      { ...input, reimbursedAmount: "2000" },
      { ...input, amount: "-1" },
      { ...input, receiptType: "999999" },
      { ...input, cuit: "invalid" },
    ];
    for (const invalid of invalidInputs) {
      expect(
        (
          await connection.client.callTool({
            name: "siradig_deduction_add_receipt",
            arguments: invalid,
          })
        ).isError,
      ).toBe(true);
    }
    expect(calls).toEqual([]);
    const valid = await connection.client.callTool({
      name: "siradig_deduction_add_receipt",
      arguments: input,
    });
    expect(valid.isError).not.toBe(true);
    expect(calls).toEqual([input]);
  } finally {
    await connection.close();
  }
});

test("failed draft changes report uncertainty and are never retried by the server", async () => {
  const service = new SiradigService({ store: memoryStore(), allowWrites: true });
  let attempts = 0;
  service.removeReceipt = async () => {
    attempts += 1;
    throw new Error("synthetic cookie: private-token");
  };
  const connection = await connect(service, true);
  try {
    const result = await connection.client.callTool({
      name: "siradig_deduction_remove_receipt",
      arguments: { person: "0", period: 2026, cuit: "30000000001", number: "0000100000001" },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "DRAFT_CHANGE_UNCONFIRMED" });
    expect(JSON.stringify(result)).not.toContain("private-token");
    expect(attempts).toBe(1);
  } finally {
    await connection.close();
  }
});

test("shutdown closes the active browser once and rejects queued operations", async () => {
  let releaseNavigation = () => {};
  const navigation = new Promise<void>((resolve) => {
    releaseNavigation = resolve;
  });
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let launches = 0;
  let browserCloses = 0;
  let contextCloses = 0;
  const session = {
    page: {
      url: () => "https://serviciosjava2.afip.gob.ar/radig/jsp/menu_sel_empresa.jsp",
      goto: async () => {
        markStarted();
        await navigation;
        throw new Error("Synthetic navigation interrupted by shutdown");
      },
    },
    context: {
      close: async () => {
        contextCloses += 1;
        releaseNavigation();
      },
    },
    browser: {
      close: async () => {
        browserCloses += 1;
      },
    },
  } as unknown as BrowserSession;
  const service = new SiradigService({
    store: memoryStore({
      cuit: "20000000001",
      createdAt: "2026-01-01T00:00:00Z",
      storageState: { cookies: [], origins: [] },
    }),
    createBrowser: async () => {
      launches += 1;
      return session;
    },
  });
  const outcomes = Promise.allSettled([service.personsList(), service.personsList()]);
  await started;
  await service.close();
  expect((await outcomes).map((result) => result.status)).toEqual(["rejected", "rejected"]);
  expect([launches, contextCloses, browserCloses]).toEqual([1, 1, 1]);
  await expect(service.sessionStatus()).rejects.toThrow("cerrando");
});

test("missing Chromium returns setup instructions over MCP without prompting or retrying", async () => {
  let launches = 0;
  const service = new SiradigService({
    store: memoryStore({
      cuit: "20000000001",
      createdAt: "2026-01-01T00:00:00Z",
      storageState: { cookies: [], origins: [] },
    }),
    createBrowser: async () => {
      launches += 1;
      throw new BrowserDependencyError();
    },
  });
  const connection = await connect(service);
  try {
    const result = await connection.client.callTool({
      name: "siradig_persons_list",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "BROWSER_REQUIRED" });
    expect(JSON.stringify(result)).toContain("arca-siradig setup");
    expect(launches).toBe(1);
  } finally {
    await connection.close();
  }
});
