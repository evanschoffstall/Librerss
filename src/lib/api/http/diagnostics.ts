import { CONFIG } from "@/lib/config";

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

export function toBodySnippet(
  data: unknown,
  maxLength = 240,
): string | undefined {
  if (typeof data === "string") {
    const compact = data.replace(/\s+/g, " ").trim();
    if (!compact) {
      return undefined;
    }

    return compact.length > maxLength
      ? `${compact.slice(0, maxLength)}…`
      : compact;
  }

  if (
    data &&
    typeof data === "object" &&
    "toString" in data &&
    typeof (data as { toString: unknown }).toString === "function"
  ) {
    const text = (data as { toString: () => string }).toString();
    const compact = text.replace(/\s+/g, " ").trim();
    if (!compact || compact === "[object Object]") {
      return undefined;
    }

    return compact.length > maxLength
      ? `${compact.slice(0, maxLength)}…`
      : compact;
  }

  return undefined;
}

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
