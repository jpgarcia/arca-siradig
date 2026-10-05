import { safeErrorMessage } from "../security/errors.js";

export function formatCliError(
  error: unknown,
  args: readonly string[] = process.argv.slice(2),
  defaultPassword: string | undefined = process.env.ARCA_PASSWORD,
): string {
  const passwords: (string | undefined)[] = [defaultPassword];
  for (const [index, arg] of args.entries()) {
    if (arg === "--password") passwords.push(args[index + 1]);
    else if (arg.startsWith("--password=")) passwords.push(arg.slice("--password=".length));
  }
  return safeErrorMessage(error, passwords);
}
