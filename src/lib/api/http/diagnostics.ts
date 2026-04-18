import { CONFIG } from "@/lib";

import { isApiError } from "./client";

const VERBOSE_LOG_LEVEL = "verbose";

const SAFE_UPSTREAM_RESPONSE_HEADERS = [
  "server",
  "cf-ray",
  "cf-cache-status",
  "x-cache",
  "x-served-by",
  "retry-after",
  "content-type",
  "content-length",
  "x-datadome",
] as const;

const SAFE_UPSTREAM_REQUEST_HEADERS = [
  "user-agent",
  "accept",
  "accept-language",
  "accept-encoding",
  "referer",
  "cache-control",
] as const;

/**
 * Build the api failure diagnostics.
 * @param error - The error.
 * @param isApiErrorFn - Whether is api error fn.
 * @returns The api failure diagnostics.
 */
export function buildApiFailureDiagnostics(
  error: unknown,
  isApiErrorFn: typeof isApiError = isApiError,
): Record<string, unknown> {
  if (!isApiErrorFn(error)) {
    return {};
  }

  const requestHeaders = pickAllowedHeaders(
    error.requestHeaders,
    SAFE_UPSTREAM_REQUEST_HEADERS,
  );
  const responseHeaders = pickAllowedHeaders(
    error.response?.headers,
    SAFE_UPSTREAM_RESPONSE_HEADERS,
  );

  return {
    requestErrorCode: error.code ?? null,
    requestHeaders,
    requestMaxRedirects: null,
    requestTimeoutMs: null,
    responseBodySnippet: toBodySnippet(error.response?.data),
    responseHeaders,
    upstreamMethod: error.method.toUpperCase(),
    upstreamStatus: error.response?.status ?? null,
    upstreamStatusText: error.response?.statusText ?? null,
    upstreamUrl: error.url,
  };
}

/**
 * Return whether is verbose logging enabled.
 * @returns Whether is verbose logging enabled.
 */
export function isVerboseLoggingEnabled(): boolean {
  const envLevel = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (envLevel) {
    return envLevel === VERBOSE_LOG_LEVEL;
  }

  try {
    return CONFIG.LOG_LEVEL === VERBOSE_LOG_LEVEL;
  } catch {
    return false;
  }
}

/**
 * Process the to body snippet.
 * @param data - The data.
 * @param maxLength - The max length value.
 * @returns The to body snippet.
 */
export function toBodySnippet(
  data: unknown,
  maxLength = 240,
): string | undefined {
  if (typeof data === "string") {
    return toCompactSnippet(data, maxLength);
  }

  if (
    data &&
    typeof data === "object" &&
    "toString" in data &&
    typeof (data as { toString: unknown }).toString === "function"
  ) {
    const text = (data as { toString: () => string }).toString();
    if (text === "[object Object]") {
      return undefined;
    }

    return toCompactSnippet(text, maxLength);
  }

  return undefined;
}

/**
 * Process the pick allowed headers.
 * @param headers - The headers.
 * @param allowed - The allowed.
 * @returns The pick allowed headers.
 */
function pickAllowedHeaders(
  headers: unknown,
  allowed: readonly string[],
): Record<string, string> {
  const normalized = toHeaderRecord(headers);
  return allowed.reduce<Record<string, string>>((acc, headerName) => {
    const value = normalized[headerName];
    if (typeof value === "string" && value.trim()) {
      acc[headerName] = value;
    }
    return acc;
  }, {});
}

/**
 * Process the to compact snippet.
 * @param text - The text.
 * @param maxLength - The max length value.
 * @returns The to compact snippet.
 */
function toCompactSnippet(text: string, maxLength: number): string | undefined {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return undefined;
  }

  return compact.length > maxLength
    ? `${compact.slice(0, maxLength)}…`
    : compact;
}

/**
 * Process the to header record.
 * @param headers - The headers.
 * @returns The to header record.
 */
function toHeaderRecord(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  const entries = Object.entries(headers as Record<string, unknown>);
  return entries.reduce<Record<string, string>>((acc, [rawName, rawValue]) => {
    const key = rawName.toLowerCase();
    if (typeof rawValue === "string") {
      acc[key] = rawValue;
      return acc;
    }

    if (Array.isArray(rawValue)) {
      acc[key] = rawValue.map((value) => String(value)).join(", ");
      return acc;
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      acc[key] = String(rawValue);
    }

    return acc;
  }, {});
}
