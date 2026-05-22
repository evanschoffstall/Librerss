/**
 * Describes the compatibility result.
 */
export interface CompatibilityResult {
  compatibilitySignalDetected: boolean;
  error?: string;
  statusCode?: number;
  success: boolean;
  vendor: string;
}

/**
 * Describes the proxy routing check.
 */
export interface ProxyRoutingCheck {
  directIp: null | string;
  error: null | string;
  proxyExitIp: null | string;
  status: "error" | "proxy-only" | "same-egress" | "verified";
}

/**
 * Describes the proxy settings snapshot.
 */
export interface ProxySettingsSnapshot {
  error: null | string;
  hasProxyPassword: boolean;
  proxyStatus: ProxyUIStatus;
  proxyUrl: string;
  proxyUsername: string;
  routingCheck: null | ProxyRoutingCheck;
}

/**
 * Defines the proxy UI status type.
 */
export type ProxyUIStatus =
  | "checking"
  | "loading"
  | "none"
  | "reachable"
  | "unreachable";

/**
 * Describes the compatibility results cache.
 */
interface CompatibilityResultsCache {
  checkedAt: number;
  results: CompatibilityResult[];
}

/**
 * Describes the persisted proxy settings.
 */
interface PersistedProxySettings {
  error?: string;
  hasProxyPassword: boolean;
  proxyUrl: null | string;
  proxyUsername: null | string;
  routingCheck: null | ProxyRoutingCheck;
  status: Exclude<ProxyUIStatus, "loading" | "none">;
}

/**
 * Describes the proxy compatibility check result.
 */
interface ProxyCompatibilityCheckResult {
  compatibilitySignalDetected: boolean;
  error?: string;
  statusCode?: number;
  success: boolean;
  vendor: string;
}

/**
 * Describes the storage reader.
 */
interface StorageReader {
  getItem: (key: string) => null | string;
}

/**
 * Describes the storage writer.
 */
interface StorageWriter extends StorageReader {
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

const ERROR_PREVIEW_CHARS = 88;
export const COMPATIBILITY_RESULTS_CACHE_KEY =
  "librerss:settings:proxy:compatibility-results:v1";

/**
 * Process the clear compatibility results cache.
 * @param storage - The storage.
 */
export function clearCompatibilityResultsCache(storage: StorageWriter) {
  storage.removeItem(COMPATIBILITY_RESULTS_CACHE_KEY);
}

/**
 * Process the format elapsed.
 * @param checkedAt - The checked at.
 * @param now - The now.
 * @returns The format elapsed.
 */
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

/**
 * Return whether has configured proxy status.
 * @param status - The status.
 * @returns Whether has configured proxy status.
 */
export function hasConfiguredProxyStatus(status: ProxyUIStatus) {
  return (
    status === "checking" || status === "reachable" || status === "unreachable"
  );
}

/**
 * Return whether is compatibility results cache.
 * @param value - The value.
 * @returns Whether is compatibility results cache.
 */
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

/**
 * Normalize the compatibility results.
 * @param results - The results.
 * @returns The compatibility results.
 */
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

/**
 * Process the preview text.
 * @param text - The text.
 * @param maxChars - The max chars.
 * @returns The preview text.
 */
export function previewText(text: string, maxChars = ERROR_PREVIEW_CHARS) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

/**
 * Process the read compatibility results cache.
 * @param storage - The storage.
 * @returns The read compatibility results cache.
 */
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

/**
 * Process the to proxy settings snapshot.
 * @param settings - The settings.
 * @returns The to proxy settings snapshot.
 */
export function toProxySettingsSnapshot(
  settings: PersistedProxySettings,
): ProxySettingsSnapshot {
  return {
    error: settings.error ?? null,
    hasProxyPassword: settings.hasProxyPassword,
    proxyStatus: settings.proxyUrl === null ? "none" : settings.status,
    proxyUrl: settings.proxyUrl ?? "",
    proxyUsername: settings.proxyUsername ?? "",
    routingCheck: settings.routingCheck,
  };
}

/**
 * Process the write compatibility results cache.
 * @param storage - The storage.
 * @param cache - The cache.
 */
export function writeCompatibilityResultsCache(
  storage: StorageWriter,
  cache: CompatibilityResultsCache,
) {
  storage.setItem(COMPATIBILITY_RESULTS_CACHE_KEY, JSON.stringify(cache));
}

/**
 * Return whether has optional number.
 * @param value - The value.
 * @param key - The key.
 * @returns Whether has optional number.
 */
function hasOptionalNumber(value: Record<string, unknown>, key: "statusCode") {
  return !(
    key in value &&
    value[key] !== undefined &&
    typeof value[key] !== "number"
  );
}

/**
 * Return whether has optional string.
 * @param value - The value.
 * @param key - The key.
 * @returns Whether has optional string.
 */
function hasOptionalString(value: Record<string, unknown>, key: "error") {
  return !(
    key in value &&
    value[key] !== undefined &&
    typeof value[key] !== "string"
  );
}

/**
 * Return whether is compatibility result.
 * @param value - The value.
 * @returns Whether is compatibility result.
 */
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

  return (
    hasOptionalString(result, "error") &&
    hasOptionalNumber(result, "statusCode")
  );
}
