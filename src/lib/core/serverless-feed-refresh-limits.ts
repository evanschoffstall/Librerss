const SERVERLESS_DNS_LOOKUP_TIMEOUT_MS = 750;
const SERVERLESS_FEED_BATCH_CONCURRENCY = 3;
const SERVERLESS_FEED_BATCH_REFRESH_BUDGET_MS = 8_500;
const SERVERLESS_FEED_REQUEST_TIMEOUT_MS = 6_000;

/** Environment variables used to detect production serverless feed-refresh limits. */
interface RuntimeEnvironment extends Record<string, string | undefined> {
  AWS_LAMBDA_FUNCTION_NAME?: string;
  FEED_SERVERLESS_LIMITS_ENABLED?: string;
  FUNCTION_TARGET?: string;
  K_SERVICE?: string;
  SERVERLESS?: string;
  WEBSITE_INSTANCE_ID?: string;
}

/**
 * Return whether the current process should use constrained serverless limits.
 * @param environment - Environment variables used for runtime detection.
 * @returns Whether serverless runtime limits should be applied.
 */
export function isConstrainedServerlessRuntime(
  environment: RuntimeEnvironment = process.env,
): boolean {
  return (
    environment.FEED_SERVERLESS_LIMITS_ENABLED === "true" ||
    environment.SERVERLESS === "1" ||
    environment.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
    environment.FUNCTION_TARGET !== undefined ||
    environment.K_SERVICE !== undefined ||
    environment.WEBSITE_INSTANCE_ID !== undefined
  );
}

/**
 * Clamp DNS validation so SSRF checks cannot consume most of a serverless request.
 * @param configuredTimeoutMs - Configured DNS lookup timeout.
 * @param environment - Environment variables used for runtime detection.
 * @returns The effective DNS lookup timeout.
 */
export function resolveDnsLookupTimeoutMs(
  configuredTimeoutMs: number,
  environment?: RuntimeEnvironment,
): number {
  return isConstrainedServerlessRuntime(environment)
    ? Math.min(configuredTimeoutMs, SERVERLESS_DNS_LOOKUP_TIMEOUT_MS)
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
  return isConstrainedServerlessRuntime(environment)
    ? Math.max(
        1,
        Math.min(configuredConcurrency, SERVERLESS_FEED_BATCH_CONCURRENCY),
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
  return isConstrainedServerlessRuntime(environment)
    ? SERVERLESS_FEED_BATCH_REFRESH_BUDGET_MS
    : Number.POSITIVE_INFINITY;
}

/**
 * Clamp upstream feed requests so they finish before a serverless platform terminates the route.
 * @param configuredTimeoutMs - Configured upstream feed request timeout.
 * @param environment - Environment variables used for runtime detection.
 * @returns The effective upstream feed request timeout.
 */
export function resolveFeedRequestTimeoutMs(
  configuredTimeoutMs: number,
  environment?: RuntimeEnvironment,
): number {
  return isConstrainedServerlessRuntime(environment)
    ? Math.min(configuredTimeoutMs, SERVERLESS_FEED_REQUEST_TIMEOUT_MS)
    : configuredTimeoutMs;
}
