/** Redacts literal, JSON-escaped, and URL-encoded secrets from error diagnostics. */
export function safeErrorMessage(
  error: unknown,
  secrets: readonly (string | undefined)[] = [],
): string {
  let message = error instanceof Error ? error.message : String(error);
  const variants = new Set<string>();
  for (const secret of secrets) {
    if (!secret) continue;
    variants.add(secret);
    variants.add(JSON.stringify(secret).slice(1, -1));
    // A malformed surrogate must not break error reporting.
    try {
      variants.add(encodeURIComponent(secret));
    } catch {
      // The literal and JSON forms still cover browser call logs.
    }
  }
  for (const secret of [...variants].sort((a, b) => b.length - a.length)) {
    message = message.replaceAll(secret, "[OCULTO]");
  }
  return message;
}
