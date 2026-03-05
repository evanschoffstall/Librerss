import { CONFIG } from "@/lib/config";
import axios from "axios";

// ── Verbose logging ───────────────────────────────────────────────────────────

const VERBOSE_LOG_LEVEL = "verbose";

export function isVerboseLoggingEnabled(): boolean {
  const envLevel = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (envLevel) return envLevel === VERBOSE_LOG_LEVEL;

  try {
    return CONFIG.LOG_LEVEL === VERBOSE_LOG_LEVEL;
  } catch {
    return false;
  }
}

// ── Header utilities ──────────────────────────────────────────────────────────

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

export function toBodySnippet(
  data: unknown,
  maxLength = 240,
): string | undefined {
  if (typeof data === "string") {
    const compact = data.replace(/\s+/g, " ").trim();
    if (!compact) return undefined;
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
    const text = String((data as { toString: () => string }).toString());
    const compact = text.replace(/\s+/g, " ").trim();
    if (!compact || compact === "[object Object]") return undefined;
    return compact.length > maxLength
      ? `${compact.slice(0, maxLength)}…`
      : compact;
  }

  return undefined;
}

// ── Axios diagnostics ─────────────────────────────────────────────────────────

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

export function buildAxiosFailureDiagnostics(
  error: unknown,
  isAxiosErrorFn: typeof axios.isAxiosError = axios.isAxiosError,
): Record<string, unknown> {
  if (!isAxiosErrorFn(error)) return {};

  const requestHeaders = pickAllowedHeaders(
    error.config?.headers,
    SAFE_UPSTREAM_REQUEST_HEADERS,
  );
  const responseHeaders = pickAllowedHeaders(
    error.response?.headers,
    SAFE_UPSTREAM_RESPONSE_HEADERS,
  );

  return {
    upstreamStatus: error.response?.status ?? null,
    upstreamStatusText: error.response?.statusText ?? null,
    upstreamMethod: error.config?.method?.toUpperCase() ?? null,
    upstreamUrl: error.config?.url ?? null,
    requestTimeoutMs:
      typeof error.config?.timeout === "number" ? error.config.timeout : null,
    requestMaxRedirects:
      typeof error.config?.maxRedirects === "number"
        ? error.config.maxRedirects
        : null,
    requestHeaders,
    responseHeaders,
    responseBodySnippet: toBodySnippet(error.response?.data),
    axiosErrorCode: error.code ?? null,
  };
}
