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
 * Normalize the auto refresh interval minutes.
 * @param value - The value.
 * @param fallback - The fallback.
 * @returns The auto refresh interval minutes.
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
 * Resolve the default auto refresh interval minutes.
 * @param configuredMinutes - The configured minutes.
 * @returns The default auto refresh interval minutes.
 */
export function resolveDefaultAutoRefreshIntervalMinutes(
  configuredMinutes: number,
): number {
  return normalizeAutoRefreshIntervalMinutes(configuredMinutes);
}

/**
 * Process the to auto refresh interval ms.
 * @param minutes - The minutes.
 * @returns The to auto refresh interval ms.
 */
export function toAutoRefreshIntervalMs(minutes: number): number {
  return normalizeAutoRefreshIntervalMinutes(minutes) * 60_000;
}
