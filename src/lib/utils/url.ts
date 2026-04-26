/**
 * Return the url credentials.
 * @param raw - The raw.
 * @returns The url credentials.
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
 * Describes the options for URL hostname display label.
 */
interface UrlHostnameDisplayLabelOptions {
  fallback?: string;
  stripWww?: boolean;
}
/**
 * Process the ensure proxy url has explicit port.
 * @param raw - The raw.
 * @returns The ensure proxy url has explicit port.
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
 * Return the url hostname display label.
 * @param raw - The raw.
 * @param options - The options used to return the url hostname display label.
 * @returns The url hostname display label.
 */
export function getUrlHostnameDisplayLabel(
  raw?: string,
  options?: UrlHostnameDisplayLabelOptions,
): string {
  const label = getUrlHostnameLabel(raw, options?.fallback ?? "No source URL");
  if (options?.stripWww === false) {
    return label;
  }

  return label.replace(/^www\./i, "");
}

/**
 * Return the url hostname label.
 * @param raw - The raw.
 * @param fallback - The fallback.
 * @returns The url hostname label.
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
 * Process the inject proxy credentials.
 * @param proxyUrl - The proxy url.
 * @param username - The rname.
 * @param password - The password.
 * @returns The inject proxy credentials.
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
 * Return whether is valid url.
 * @param url - The url.
 * @returns Whether is valid url.
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
 * Normalize the distinct url list.
 * @param urls - The urls.
 * @returns The distinct url list.
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
 * Normalize the feed url.
 * @param raw - The raw.
 * @returns The feed url.
 */
export function normalizeFeedUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString().replace(/\/+$/, "");
}

/**
 * Process the redact url for logs.
 * @param raw - The raw.
 * @returns The redact url for logs.
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
 * Process the strip url credentials.
 * @param raw - The raw.
 * @returns The strip url credentials.
 */
export function stripUrlCredentials(raw: string): string {
  return getUrlCredentials(raw)?.sanitizedUrl ?? raw;
}

/**
 * Process the strip url fragment.
 * @param url - The url.
 * @returns The strip url fragment.
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
 * Process the try get url hostname.
 * @param raw - The raw.
 * @returns The try get url hostname.
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
 * Process the try normalize feed url.
 * @param raw - The raw.
 * @returns The try normalize feed url.
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
 * Process the format url without credentials.
 * @param parsed - The d.
 * @returns The format url without credentials.
 */
function formatUrlWithoutCredentials(parsed: URL): string {
  const base = `${parsed.protocol}//${parsed.host}`;
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  return `${base}${path}${parsed.search}${parsed.hash}`;
}
