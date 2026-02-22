/**
 * Shared SSRF (Server-Side Request Forgery) protection utilities.
 *
 * These predicates are intentionally pure/synchronous so they can be imported
 * by any route without side effects. DNS resolution and caching are handled
 * at the call-site (e.g. feeds/route.ts) because different routes have
 * different caching and failure semantics.
 */

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/i,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
] as const;

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function isBlockedHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return true;
  }

  return (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

export function isBlockedResolvedAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const ipv4MappedPrefix = "::ffff:";

  if (normalized.startsWith(ipv4MappedPrefix)) {
    return isBlockedHost(normalized.slice(ipv4MappedPrefix.length));
  }

  return isBlockedHost(normalized);
}
