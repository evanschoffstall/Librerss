/**
 * Pure URL utilities — no server-only or DOM dependencies.
 * Safe to import from both server routes and client modules.
 */

/**
 * Extracts embedded URL credentials while returning a version of the URL with
 * userinfo removed.
 */
export function getUrlCredentials(raw: string): null | {
  password: null | string;
  sanitizedUrl: string;
  username: null | string;
} {
  try {
    const parsed = new URL(raw);
    const username = parsed.username
      ? decodeURIComponent(parsed.username)
      : null;
    const password = parsed.password
      ? decodeURIComponent(parsed.password)
      : null;
    parsed.username = "";
    parsed.password = "";

    return {
      password,
      sanitizedUrl: formatUrlWithoutCredentials(parsed),
      username,
    };
  } catch {
    return null;
  }
}

const DEFAULT_PROXY_PORT_BY_PROTOCOL: Readonly<Record<string, string>> = {
  "socks4:": "1080",
  "socks4a:": "1080",
  "socks5:": "1080",
  "socks5h:": "1080",
  "socks:": "1080",
};

/**
 * Canonicalizes proxy URLs that rely on implicit SOCKS default ports.
 *
 * Some downstream proxy clients reject `socks5://host` even though the WHATWG
 * URL parser accepts it. Returning an explicit `:1080` keeps stored legacy
 * values usable across all fetch paths without changing HTTP/HTTPS handling.
 */
export function ensureProxyUrlHasExplicitPort(raw: string): string {
  try {
    const parsed = new URL(raw);
    const defaultPort = DEFAULT_PROXY_PORT_BY_PROTOCOL[parsed.protocol];
    if (!defaultPort || parsed.port) {
      return raw;
    }

    parsed.port = defaultPort;
    return parsed.toString();
  } catch {
    return raw;
  }
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
 * Injects username/password credentials into a proxy URL.
 * The URL API's `.username` / `.password` setters apply the correct userinfo
 * percent-encoding (RFC 3986 §3.2.1), so plain strings are assigned directly.
 * Returns the original URL string if it is unparseable.
 */
export function injectProxyCredentials(
  proxyUrl: string,
  username: string,
  password: string,
): string {
  try {
    const parsed = new URL(proxyUrl);
    parsed.username = username;
    parsed.password = password;
    return parsed.toString();
  } catch {
    return proxyUrl;
  }
}

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
 * Redacts sensitive URL components (credentials, query, hash) for logs.
 */
export function redactUrlForLogs(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "[empty-url]";

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
 * Removes embedded URL credentials while preserving the rest of the URL.
 */
export function stripUrlCredentials(raw: string): string {
  return getUrlCredentials(raw)?.sanitizedUrl ?? raw;
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
 * Best-effort hostname extraction for display/caching.
 */
export function tryGetUrlHostname(raw?: string): null | string {
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
 * Injects username/password credentials into a proxy URL.
 * Returns the original URL if it's unparseable.
 */
function formatUrlWithoutCredentials(parsed: URL): string {
  const base = `${parsed.protocol}//${parsed.host}`;
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  return `${base}${path}${parsed.search}${parsed.hash}`;
}
