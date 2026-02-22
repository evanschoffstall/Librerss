/**
 * Pure URL utilities — no server-only or DOM dependencies.
 * Safe to import from both server routes and client modules.
 */

/**
 * Normalizes a feed URL by stripping hash, credentials, and trailing slashes.
 *
 * @throws {TypeError} if {@link raw} is not a valid URL.
 */
export function normalizeFeedUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString().replace(/\/+$/, "");
}

/**
 * Like {@link normalizeFeedUrl} but returns a best-effort fallback instead of
 * throwing when the URL is unparseable. Use this when the input URL is
 * user-supplied or otherwise untrusted.
 */
export function tryNormalizeFeedUrl(raw: string): string {
  try {
    return normalizeFeedUrl(raw);
  } catch {
    return raw.trim().replace(/\/+$/, "");
  }
}
