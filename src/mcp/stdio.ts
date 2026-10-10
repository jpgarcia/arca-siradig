import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./server.js";

export function startMcpServer(options: { headless: boolean; allowWrites: boolean }): void {
  const handle = serveStdio(() => createMcpServer(options), {
    onerror: () => console.error("Error de transporte MCP. Revisá la configuración del cliente."),
  });
  const stop = () => {
    void handle.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
