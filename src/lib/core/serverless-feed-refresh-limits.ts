const VERCEL_DNS_LOOKUP_TIMEOUT_MS = 750;
const VERCEL_FEED_BATCH_CONCURRENCY = 3;
const VERCEL_FEED_BATCH_REFRESH_BUDGET_MS = 8_500;
const VERCEL_FEED_REQUEST_TIMEOUT_MS = 6_000;

/** Environment variables used to detect production serverless feed-refresh limits. */
interface RuntimeEnvironment extends Record<string, string | undefined> {
  VERCEL?: string;
  VERCEL_ENV?: string;
}

/**
 * Return whether the current process is running inside Vercel.
 * @param environment - Environment variables used for runtime detection.
 * @returns Whether Vercel runtime limits should be applied.
 */
export function isVercelRuntime(
  environment: RuntimeEnvironment = process.env,
): boolean {
  return environment.VERCEL === "1" || environment.VERCEL_ENV !== undefined;
}

/**
 * Clamp DNS validation so SSRF checks cannot consume most of a Vercel request.
 * @param configuredTimeoutMs - Configured DNS lookup timeout.
 * @param environment - Environment variables used for runtime detection.
 * @returns The effective DNS lookup timeout.
 */
export function resolveDnsLookupTimeoutMs(
  configuredTimeoutMs: number,
  environment?: RuntimeEnvironment,
): number {
  return isVercelRuntime(environment)
    ? Math.min(configuredTimeoutMs, VERCEL_DNS_LOOKUP_TIMEOUT_MS)
    : configuredTimeoutMs;
}

/**
 * Clamp feed refresh concurrency in serverless runtimes to avoid DNS resolver saturation.
 * @param configuredConcurrency - Configured maximum number of parallel feed refreshes.
 * @param environment - Environment variables used for runtime detection.
 * @returns The effective feed refresh concurrency.
 */
export function resolveFeedBatchConcurrency(
  configuredConcurrency: number,
  environment?: RuntimeEnvironment,
): number {
  return isVercelRuntime(environment)
    ? Math.max(
        1,
        Math.min(configuredConcurrency, VERCEL_FEED_BATCH_CONCURRENCY),
      )
    : configuredConcurrency;
}

/**
 * Return the total upstream-refresh budget for one batch request.
 * @param environment - Environment variables used for runtime detection.
 * @returns The effective batch refresh budget in milliseconds.
 */
export function resolveFeedBatchRefreshBudgetMs(
  environment?: RuntimeEnvironment,
): number {
  return isVercelRuntime(environment)
    ? VERCEL_FEED_BATCH_REFRESH_BUDGET_MS
    : Number.POSITIVE_INFINITY;
}

/**
 * Clamp upstream feed requests so they finish before Vercel terminates the route.
 * @param configuredTimeoutMs - Configured upstream feed request timeout.
 * @param environment - Environment variables used for runtime detection.
 * @returns The effective upstream feed request timeout.
 */
export function resolveFeedRequestTimeoutMs(
  configuredTimeoutMs: number,
  environment?: RuntimeEnvironment,
): number {
  return isVercelRuntime(environment)
    ? Math.min(configuredTimeoutMs, VERCEL_FEED_REQUEST_TIMEOUT_MS)
    : configuredTimeoutMs;
}
