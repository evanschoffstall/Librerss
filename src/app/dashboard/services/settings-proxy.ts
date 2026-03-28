export interface CompatibilityResult {
  compatibilitySignalDetected: boolean;
  error?: string;
  statusCode?: number;
  success: boolean;
  vendor: string;
}

export interface CompatibilityResultsCache {
  checkedAt: number;
  results: CompatibilityResult[];
}

export interface ProxySettingsSnapshot {
  allowInsecureTls: boolean;
  error: null | string;
  hasProxyPassword: boolean;
  proxyStatus: ProxyUIStatus;
  proxyUrl: string;
  proxyUsername: string;
}

export type ProxyUIStatus =
  | "checking"
  | "loading"
  | "none"
  | "reachable"
  | "unreachable";

interface PersistedProxySettings {
  allowInsecureTls: boolean;
  error?: string;
  hasProxyPassword: boolean;
  proxyUrl: null | string;
  proxyUsername: null | string;
  status: Exclude<ProxyUIStatus, "loading" | "none">;
}

interface ProxyCompatibilityCheckResult {
  compatibilitySignalDetected: boolean;
  error?: string;
  statusCode?: number;
  success: boolean;
  vendor: string;
}

interface StorageReader {
  getItem: (key: string) => null | string;
}

interface StorageWriter extends StorageReader {
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

const ERROR_PREVIEW_CHARS = 88;
export const COMPATIBILITY_RESULTS_CACHE_KEY =
  "librerss:settings:proxy:compatibility-results:v1";

export function clearCompatibilityResultsCache(storage: StorageWriter) {
  storage.removeItem(COMPATIBILITY_RESULTS_CACHE_KEY);
}

export function formatElapsed(checkedAt: number, now: number) {
  const elapsedSec = Math.max(0, Math.floor((now - checkedAt) / 1000));
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 60) return `${elapsedMin}m ago`;
  const elapsedHr = Math.floor(elapsedMin / 60);
  if (elapsedHr < 24) return `${elapsedHr}h ago`;
  const elapsedDay = Math.floor(elapsedHr / 24);
  return `${elapsedDay}d ago`;
}

export function hasConfiguredProxyStatus(status: ProxyUIStatus) {
  return (
    status === "checking" ||
    status === "reachable" ||
    status === "unreachable"
  );
}

export function isCompatibilityResultsCache(
  value: unknown,
): value is CompatibilityResultsCache {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("checkedAt" in value) || !("results" in value)) {
    return false;
  }

  const checkedAt = value.checkedAt;
  const results = value.results;
  if (typeof checkedAt !== "number" || !Number.isFinite(checkedAt)) {
    return false;
  }

  return (
    Array.isArray(results) &&
    results.every((result) => isCompatibilityResult(result))
  );
}

export function normalizeCompatibilityResults(
  results: ProxyCompatibilityCheckResult[],
): CompatibilityResult[] {
  return results.map(
    ({ compatibilitySignalDetected, error, statusCode, success, vendor }) => ({
      compatibilitySignalDetected,
      ...(error ? { error } : {}),
      ...(statusCode === undefined ? {} : { statusCode }),
      success,
      vendor,
    }),
  );
}

export function previewText(text: string, maxChars = ERROR_PREVIEW_CHARS) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

export function readCompatibilityResultsCache(
  storage: StorageReader,
): CompatibilityResultsCache | null {
  try {
    const raw = storage.getItem(COMPATIBILITY_RESULTS_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    return isCompatibilityResultsCache(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function toProxySettingsSnapshot(
  settings: PersistedProxySettings,
): ProxySettingsSnapshot {
  return {
    allowInsecureTls: settings.allowInsecureTls,
    error: settings.error ?? null,
    hasProxyPassword: settings.hasProxyPassword,
    proxyStatus: settings.proxyUrl === null ? "none" : settings.status,
    proxyUrl: settings.proxyUrl ?? "",
    proxyUsername: settings.proxyUsername ?? "",
  };
}

export function writeCompatibilityResultsCache(
  storage: StorageWriter,
  cache: CompatibilityResultsCache,
) {
  storage.setItem(COMPATIBILITY_RESULTS_CACHE_KEY, JSON.stringify(cache));
}

function isCompatibilityResult(value: unknown): value is CompatibilityResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;

  if (
    typeof result.compatibilitySignalDetected !== "boolean" ||
    typeof result.success !== "boolean" ||
    typeof result.vendor !== "string"
  ) {
    return false;
  }

  if (
    "error" in result &&
    result.error !== undefined &&
    typeof result.error !== "string"
  ) {
    return false;
  }

  return !(
    "statusCode" in result &&
    result.statusCode !== undefined &&
    typeof result.statusCode !== "number"
  );
}