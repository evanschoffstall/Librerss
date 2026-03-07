/**
 * Pure URL utilities — no server-only or DOM dependencies.
 * Safe to import from both server routes and client modules.
 */

/**
 * Returns true when the URL is a valid http/https URL.
 * Consolidates the single validation path used across server routes and
 * client modules; replaces the former isValidUrl in lib/core/utils.
 */
export function isValidUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    // Invalid URL - return false
    return false;
  }
}

/**
 * Strips the URL fragment (hash) if present.  Returns the original string
 * when it is not a valid URL or has no fragment.
 *
 * URL fragments are client-side navigation hints that must not appear in
 * HTTP request URIs (RFC 3986 §3.5).  Some CDN edge nodes (Cloudflare,
 * Akamai, Fastly) treat a request-URI containing a literal '#' as
 * malformed and return 403/400.
 */
export function stripUrlFragment(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hash) {
      parsed.hash = "";
      return parsed.toString();
    }
  } catch {
    // Unparseable — return as-is
  }
  return url;
}

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
    // Invalid URL - return trimmed fallback
    return raw.trim().replace(/\/+$/, "");
  }
}

/**
 * Normalizes an unknown list of URL candidates into a deduplicated array.
 * Non-string and empty values are discarded.
 */
export function normalizeDistinctUrlList(urls: unknown): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }

  return Array.from(
    new Set(
      urls
        .filter((url): url is string => typeof url === "string")
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Best-effort hostname extraction for display/caching.
 */
export function tryGetUrlHostname(raw?: string): string | null {
  if (!raw) {
    return null;
  }

  try {
    const hostname = new URL(raw).hostname
      .trim()
      .toLowerCase()
      .replace(/\.$/, "");
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Human-friendly hostname label with fallback for invalid/missing URLs.
 */
export function getUrlHostnameLabel(
  raw?: string,
  fallback = "No source URL",
): string {
  if (!raw) {
    return fallback;
  }

  return tryGetUrlHostname(raw) ?? raw;
}

/**
 * Human-friendly hostname label with optional `www.` stripping.
 */
export function getUrlHostnameDisplayLabel(
  raw?: string,
  options?: {
    fallback?: string;
    stripWww?: boolean;
  },
): string {
  const label = getUrlHostnameLabel(raw, options?.fallback ?? "No source URL");
  if (options?.stripWww === false) {
    return label;
  }

  return label.replace(/^www\./i, "");
}

/**
 * Creates a stable lookup key for feed URLs, preserving path and query params.
 * Used for category resolution and feed matching across the GReader API.
 */
export function toCategoryLookupKey(feedUrl: string): string {
  const trimmed = feedUrl.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    const search = parsed.search;
    return `${host}${pathname}${search}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
  }
}

/**
 * Redacts sensitive URL components (credentials, query, hash) for logs.
 */
export function redactUrlForLogs(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "[empty-url]";
  }

  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    // Non-special schemes (socks5://, socks4://, etc.) and bare host:port
    // parsed as a scheme produce an opaque origin (the string "null").
    // Reconstruct from components to avoid returning the misleading literal.
    if (parsed.origin === "null") {
      const portPart = parsed.port ? `:${parsed.port}` : "";
      const hostPart = parsed.hostname ? `//${parsed.hostname}${portPart}` : "";
      return `${parsed.protocol}${hostPart}${parsed.pathname}`;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

/**
 * Injects username/password credentials into a proxy URL.
 * Returns the original URL if it's unparseable.
 */
export function injectProxyCredentials(
  proxyUrl: string,
  username: string,
  password: string,
): string {
  try {
    const parsed = new URL(proxyUrl);
    parsed.username = encodeURIComponent(username);
    parsed.password = encodeURIComponent(password);
    return parsed.toString();
  } catch {
    return proxyUrl;
  }
}
