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

export type ProxyUIStatus =
  | "checking"
  | "loading"
  | "none"
  | "reachable"
  | "unreachable";

const ERROR_PREVIEW_CHARS = 88;
export const COMPATIBILITY_RESULTS_CACHE_KEY =
  "librerss:settings:proxy:compatibility-results:v1";

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

export function isCompatibilityResultsCache(
  value: unknown,
): value is CompatibilityResultsCache {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "checkedAt" in value && "results" in value;
}

export function previewText(text: string, maxChars = ERROR_PREVIEW_CHARS) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}