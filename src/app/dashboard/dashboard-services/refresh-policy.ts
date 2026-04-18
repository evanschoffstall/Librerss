/** Shared refresh policy used by the dashboard UI. */
export const AUTO_REFRESH_INTERVAL_STORAGE_KEY =
  "librerss:autoRefreshIntervalMinutes";

/** Automatic refreshes must never run more frequently than every 30 minutes. */
export const MIN_AUTO_REFRESH_INTERVAL_MINUTES = 30;

/** Default automatic refresh cadence for dashboard polling. */
const DEFAULT_AUTO_REFRESH_INTERVAL_MINUTES = 30;

/** Manual refreshes remain eligible every five minutes. */
export const MANUAL_REFRESH_INTERVAL_MINUTES = 5;

/**
 * Normalizes a user-provided automatic refresh interval to the supported floor.
 * @param value
 * @param fallback
 */
export function normalizeAutoRefreshIntervalMinutes(
  value: number,
  fallback = DEFAULT_AUTO_REFRESH_INTERVAL_MINUTES,
): number {
  const normalizedFallback = Number.isFinite(fallback)
    ? Math.max(MIN_AUTO_REFRESH_INTERVAL_MINUTES, Math.round(fallback))
    : DEFAULT_AUTO_REFRESH_INTERVAL_MINUTES;

  if (!Number.isFinite(value)) {
    return normalizedFallback;
  }

  return Math.max(MIN_AUTO_REFRESH_INTERVAL_MINUTES, Math.round(value));
}

/**
 * Resolves the initial automatic refresh interval from runtime config.
 * @param configuredMinutes
 */
export function resolveDefaultAutoRefreshIntervalMinutes(
  configuredMinutes: number,
): number {
  return normalizeAutoRefreshIntervalMinutes(configuredMinutes);
}

/**
 * Converts the normalized automatic refresh interval to milliseconds.
 * @param minutes
 */
export function toAutoRefreshIntervalMs(minutes: number): number {
  return normalizeAutoRefreshIntervalMinutes(minutes) * 60_000;
}
