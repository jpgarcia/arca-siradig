import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);
const server = createServer((request, response) => {
  const entry = files.get(new URL(request.url, "http://localhost").pathname);
  if (!entry) {
    response.writeHead(404).end("No se encontró la página.");
    return;
  }
  response.writeHead(200, { "Content-Type": entry[1], "Cache-Control": "no-store" });
  createReadStream(fileURLToPath(new URL(`../site/${entry[0]}`, import.meta.url))).pipe(response);
});
server.listen(4173, "127.0.0.1", () => {
  console.log("Landing local: http://localhost:4173");
});
server.on("error", (error) => {
  console.error(`No se pudo iniciar la vista previa: ${error.message}`);
  process.exitCode = 1;
});
