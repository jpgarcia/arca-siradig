import { execFileSync } from "node:child_process";
import { chmod, rm } from "node:fs/promises";

const compiler = "node_modules/typescript/bin/tsc";
// Check tests and development tools too, without shipping their compiled fixtures.
execFileSync(process.execPath, [compiler, "--project", "tsconfig.json", "--noEmit"], {
  stdio: "inherit",
});
await rm("dist", { recursive: true, force: true });
execFileSync(process.execPath, [compiler, "--project", "tsconfig.build.json"], {
  stdio: "inherit",
});
// npm link points at this file, so rebuilding must preserve its executable permission.
await chmod("dist/src/cli/index.js", 0o755);
