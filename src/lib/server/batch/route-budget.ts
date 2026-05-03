import { resolveFeedBatchRefreshBudgetMs } from "@/lib/core";

import type { BatchUrlDescriptor } from "./endpoint";
import type { BatchFetchExecutionResult } from "./isolated-feed-fallback";

import { buildBatchFetchExecutionResult } from "./isolated-feed-fallback";

/** Error reported when the route must answer before the platform terminates it. */
export const BATCH_ROUTE_BUDGET_EXHAUSTED_MESSAGE =
  "Batch response budget exhausted before feed batch completed";

/**
 * Describes the options for executing a batch under the route response budget.
 */
interface ExecuteBatchBeforeRouteDeadlineOptions {
  clearTimeoutFn: typeof clearTimeout;
  execute: () => Promise<BatchFetchExecutionResult>;
  normalizedUrls: string[];
  nowFn: () => number;
  requestStartedAt: number;
  requestUrls: BatchUrlDescriptor[];
  setTimeoutFn: typeof setTimeout;
}

/**
 * Describes the options for building a route-level budget exhaustion result.
 */
interface RouteBudgetExhaustedResultOptions {
  normalizedUrls: string[];
  requestUrls: BatchUrlDescriptor[];
}

/**
 * Describes the options for resolving the remaining route response budget.
 */
interface RouteRemainingBudgetOptions {
  nowFn: () => number;
  requestStartedAt: number;
}

/**
 * Execute the batch fetch while preserving enough time to return a controlled response.
 * @param options - Batch execution callback and route clock/timer dependencies.
 * @returns The completed batch result or a per-feed route-budget error result.
 */
export async function executeBatchBeforeRouteDeadline(
  options: ExecuteBatchBeforeRouteDeadlineOptions,
): Promise<BatchFetchExecutionResult> {
  const remainingBudgetMs = resolveRouteRemainingBudgetMs(options);

  if (!Number.isFinite(remainingBudgetMs)) {
    return options.execute();
  }

  if (remainingBudgetMs <= 0) {
    return buildRouteBudgetExhaustedResult(options);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<BatchFetchExecutionResult>((resolve) => {
    timeoutId = options.setTimeoutFn(() => {
      resolve(buildRouteBudgetExhaustedResult(options));
    }, remainingBudgetMs);
  });

  try {
    return await Promise.race([options.execute(), timeoutResult]);
  } finally {
    if (timeoutId !== undefined) {
      options.clearTimeoutFn(timeoutId);
    }
  }
}

/**
 * Build a per-feed timeout result when route-level work exceeds the serverless response budget.
 * @param options - Original request URL descriptors and normalized URLs.
 * @returns Batch execution result whose valid feeds carry a timeout error.
 */
function buildRouteBudgetExhaustedResult(
  options: RouteBudgetExhaustedResultOptions,
): BatchFetchExecutionResult {
  return buildBatchFetchExecutionResult({
    batchResponse: {
      articles: new Map(),
      cachedCount: 0,
      cooldownLimitedCount: 0,
      errors: new Map(
        options.normalizedUrls.map((url) => [
          url,
          BATCH_ROUTE_BUDGET_EXHAUSTED_MESSAGE,
        ]),
      ),
      lastFetchedByUrl: new Map(),
      refreshedCount: 0,
      resolution: "cache",
      unchangedUrls: new Set(),
    },
    requestUrls: options.requestUrls,
  });
}

/**
 * Resolve remaining route response budget for the current serverless runtime.
 * @param options - Route start time and clock dependency.
 * @returns Remaining milliseconds, or infinity outside constrained runtimes.
 */
function resolveRouteRemainingBudgetMs(
  options: RouteRemainingBudgetOptions,
): number {
  const budgetMs = resolveFeedBatchRefreshBudgetMs();
  if (!Number.isFinite(budgetMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return budgetMs - (options.nowFn() - options.requestStartedAt);
}
