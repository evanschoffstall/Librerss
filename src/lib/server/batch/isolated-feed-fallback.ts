import type { fetchAndCacheFeedArticlesBatch } from "@/lib/core/server";

import { CONFIG, logger } from "@/lib";
import {
  resolveFeedBatchConcurrency,
  resolveFeedBatchRefreshBudgetMs,
  resolveFeedRequestTimeoutMs,
} from "@/lib/core";
import { toErrorMessage } from "@/lib/utils";

import type { BatchUrlDescriptor } from "./endpoint";
import type { buildBatchFetchRequestOptions } from "./fetch-execution";

import { buildBatchFetchResults } from "./fetch-execution";

/** Describes the batch fetch execution result consumed by the route response builder. */
export interface BatchFetchExecutionResult {
  cachedCount: number;
  cooldownLimitedCount: number;
  lastFetchedByUrl: BatchFetchResponse["lastFetchedByUrl"];
  refreshedCount: number;
  resolution: BatchFetchResponse["resolution"];
  results: { articles: unknown[]; ok: boolean }[];
  upstreamErrors: BatchFetchResponse["errors"];
}

/** Defines the article list stored for one feed in a batch response. */
type BatchArticleList =
  BatchFetchResponse["articles"] extends Map<string, infer ArticleList>
    ? ArticleList
    : never;

/** Defines the batch fetcher response shape returned by the core pipeline. */
type BatchFetchResponse = Awaited<
  ReturnType<typeof fetchAndCacheFeedArticlesBatch>
>;

/** Describes mutable maps that receive one isolated batch response. */
interface BatchResponseMapTargets {
  articles: Map<string, BatchArticleList>;
  errors: Map<string, string>;
  lastFetchedByUrl: Map<string, Date>;
  response: BatchFetchResponse;
  unchangedUrls: Set<string>;
}

/** Describes the options for building a route batch execution result. */
interface BuildBatchFetchExecutionResultOptions {
  batchResponse: BatchFetchResponse;
  requestUrls: BatchUrlDescriptor[];
}

/** Describes the options for isolated per-feed batch fallback execution. */
interface ExecuteIsolatedFeedBatchFallbackOptions {
  batchFetchOptions: ReturnType<typeof buildBatchFetchRequestOptions>;
  db: Parameters<typeof fetchAndCacheFeedArticlesBatch>[0];
  fetchAndCacheFeedArticlesBatchForRoute: typeof fetchAndCacheFeedArticlesBatch;
  initialError: unknown;
  normalizedUrls: string[];
  nowFn?: () => number;
  requestStartedAt: number;
  requestUrls: BatchUrlDescriptor[];
  userId: number;
}

/** Describes the options for resolving the isolated fallback retry deadline. */
interface IsolatedFeedBatchFallbackDeadlineOptions {
  requestStartedAt: number;
}

/** Describes one isolated feed retry task. */
interface IsolatedFeedBatchRetryTask {
  run: () => Promise<IsolatedFeedBatchSuccess>;
}

/** Describes the isolated fallback settlement summary. */
interface IsolatedFeedBatchSettlementSummary {
  failedUrls: Map<string, string>;
  successes: IsolatedFeedBatchSuccess[];
}

/** Describes one successful isolated feed batch result. */
interface IsolatedFeedBatchSuccess {
  response: BatchFetchResponse;
  url: string;
}

/** Describes options for bounded isolated feed retry settlement. */
interface SettleIsolatedFeedBatchRetriesOptions {
  latestStartAt: number;
  nowFn: () => number;
  tasks: IsolatedFeedBatchRetryTask[];
}

/** Error reported for isolated fallback retries skipped to protect serverless request budgets. */
export const ISOLATED_FEED_BATCH_FALLBACK_BUDGET_EXHAUSTED_MESSAGE =
  "Batch fallback budget exhausted before isolated feed retry started";

/**
 * Build the route-level batch execution result from a core batch response.
 * @param options - Core response and original request-url descriptors.
 * @returns The route execution result consumed by the response builder.
 */
export function buildBatchFetchExecutionResult(
  options: BuildBatchFetchExecutionResultOptions,
): BatchFetchExecutionResult {
  const { batchResponse, requestUrls } = options;
  return {
    cachedCount: batchResponse.cachedCount,
    cooldownLimitedCount: batchResponse.cooldownLimitedCount,
    lastFetchedByUrl: batchResponse.lastFetchedByUrl,
    refreshedCount: batchResponse.refreshedCount,
    resolution: batchResponse.resolution,
    results: buildBatchFetchResults({
      requestUrls,
      response: batchResponse,
    }),
    upstreamErrors: batchResponse.errors,
  };
}

/**
 * Retry a failed multi-feed batch as isolated single-feed batches.
 * @param options - Failed batch context and route dependencies.
 * @returns A combined result when at least one isolated feed succeeds.
 */
export async function executeIsolatedFeedBatchFallback(
  options: ExecuteIsolatedFeedBatchFallbackOptions,
): Promise<BatchFetchExecutionResult | null> {
  if (options.normalizedUrls.length <= 1) {
    return null;
  }

  const settlements = await settleIsolatedFeedBatchRetries({
    latestStartAt: resolveLatestIsolatedFallbackStartAt({
      requestStartedAt: options.requestStartedAt,
    }),
    nowFn: options.nowFn ?? Date.now,
    tasks: buildIsolatedFeedBatchRetryTasks(options),
  });
  const { failedUrls, successes } = summarizeIsolatedFeedBatchSettlements(
    settlements,
    options.normalizedUrls,
  );

  if (successes.length === 0 && failedUrls.size === 0) {
    return null;
  }

  logger.warn("Feed batch fetch fell back to isolated feed requests", {
    failedFeedCount: failedUrls.size,
    originalError: toErrorMessage(options.initialError),
    succeededFeedCount: successes.length,
    userId: options.userId,
  });

  return buildBatchFetchExecutionResult({
    batchResponse: combineIsolatedFeedBatchResponses(successes, failedUrls),
    requestUrls: options.requestUrls,
  });
}

/**
 * Build one isolated retry task for each URL in the failed batch.
 * @param options - Failed batch context and route dependencies.
 * @returns Retry tasks aligned with the normalized URL order.
 */
function buildIsolatedFeedBatchRetryTasks(
  options: ExecuteIsolatedFeedBatchFallbackOptions,
): IsolatedFeedBatchRetryTask[] {
  return options.normalizedUrls.map((url) => ({
    /**
     * Run one isolated single-feed retry for a URL that participated in the failed multi-feed batch.
     * @returns The isolated feed batch response paired with its URL.
     */
    run: async () => {
      const response = await options.fetchAndCacheFeedArticlesBatchForRoute(
        options.db,
        options.userId,
        [url],
        options.batchFetchOptions,
      );

      return { response, url };
    },
  }));
}

/**
 * Combine isolated per-feed responses after a whole-batch failure.
 * @param successes - Successful isolated feed responses.
 * @param failedUrls - URLs whose isolated retry still failed.
 * @returns A synthetic core batch response preserving per-feed errors.
 */
function combineIsolatedFeedBatchResponses(
  successes: IsolatedFeedBatchSuccess[],
  failedUrls: Map<string, string>,
): BatchFetchResponse {
  const articles = new Map<string, BatchArticleList>();
  const errors = new Map(failedUrls);
  const lastFetchedByUrl = new Map<string, Date>();
  const unchangedUrls = new Set<string>();
  let cachedCount = 0;
  let cooldownLimitedCount = 0;
  let refreshedCount = 0;
  let resolution: BatchFetchResponse["resolution"] = "cache";

  for (const { response } of successes) {
    cachedCount += response.cachedCount;
    cooldownLimitedCount += response.cooldownLimitedCount;
    refreshedCount += response.refreshedCount;
    resolution = resolveCombinedBatchResolution(
      resolution,
      response.resolution,
    );
    mergeBatchResponseMaps({
      articles,
      errors,
      lastFetchedByUrl,
      response,
      unchangedUrls,
    });
  }

  return {
    articles,
    cachedCount,
    cooldownLimitedCount,
    errors,
    lastFetchedByUrl,
    refreshedCount,
    resolution,
    unchangedUrls,
  };
}

/**
 * Merge the map-like fields from one isolated response into aggregate maps.
 * @param targets - Aggregate map targets and the isolated response to merge.
 */
function mergeBatchResponseMaps(targets: BatchResponseMapTargets): void {
  for (const [url, items] of targets.response.articles.entries()) {
    targets.articles.set(url, items);
  }
  for (const [url, error] of targets.response.errors.entries()) {
    targets.errors.set(url, error);
  }
  for (const [
    url,
    lastFetchedAt,
  ] of targets.response.lastFetchedByUrl.entries()) {
    targets.lastFetchedByUrl.set(url, lastFetchedAt);
  }
  for (const url of targets.response.unchangedUrls) {
    targets.unchangedUrls.add(url);
  }
}

/**
 * Preserve the broadest resolution label represented by combined isolated responses.
 * @param currentResolution - The aggregate resolution so far.
 * @param nextResolution - The next isolated response resolution.
 * @returns The combined resolution label.
 */
function resolveCombinedBatchResolution(
  currentResolution: BatchFetchResponse["resolution"],
  nextResolution: BatchFetchResponse["resolution"],
): BatchFetchResponse["resolution"] {
  if (currentResolution === "upstream" || nextResolution === "upstream") {
    return "upstream";
  }

  if (currentResolution === "memory" || nextResolution === "memory") {
    return "memory";
  }

  return "cache";
}

/**
 * Resolve the latest safe wall-clock time for starting an isolated fallback retry.
 * @param options - Route timing information captured before auth and parsing work.
 * @returns The latest timestamp at which another isolated retry may start.
 */
function resolveLatestIsolatedFallbackStartAt(
  options: IsolatedFeedBatchFallbackDeadlineOptions,
): number {
  const budgetMs = resolveFeedBatchRefreshBudgetMs();
  if (!Number.isFinite(budgetMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return (
    options.requestStartedAt +
    Math.max(
      0,
      budgetMs - resolveFeedRequestTimeoutMs(CONFIG.FEED_REQUEST_TIMEOUT_MS),
    )
  );
}

/**
 * Run isolated feed retry tasks with bounded concurrency and a serverless-safe start deadline.
 * @param options - Retry tasks, clock, and latest safe start timestamp.
 * @returns Settled retry results aligned with the original URL order.
 */
async function settleIsolatedFeedBatchRetries(
  options: SettleIsolatedFeedBatchRetriesOptions,
): Promise<PromiseSettledResult<IsolatedFeedBatchSuccess>[]> {
  const results: PromiseSettledResult<IsolatedFeedBatchSuccess>[] = [];
  results.length = options.tasks.length;
  let nextTaskIndex = 0;

  /**
   * Runs one bounded fallback worker until every retry has either started or
   * been rejected before start because the route budget is already spent.
   */
  async function worker(): Promise<void> {
    while (nextTaskIndex < options.tasks.length) {
      const taskIndex = nextTaskIndex++;
      const task = options.tasks[taskIndex];

      if (options.nowFn() > options.latestStartAt) {
        results[taskIndex] = {
          reason: new Error(
            ISOLATED_FEED_BATCH_FALLBACK_BUDGET_EXHAUSTED_MESSAGE,
          ),
          status: "rejected",
        };
        continue;
      }

      try {
        results[taskIndex] = { status: "fulfilled", value: await task.run() };
      } catch (reason) {
        results[taskIndex] = { reason, status: "rejected" };
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          resolveFeedBatchConcurrency(CONFIG.FEED_BATCH_CONCURRENCY),
          options.tasks.length,
        ),
      },
      () => worker(),
    ),
  );

  return results;
}

/**
 * Summarize settled isolated retry tasks into successes and per-url failures.
 * @param settlements - Settled isolated retry results.
 * @param normalizedUrls - URLs aligned with the settlement order.
 * @returns Successful isolated responses and failed URL messages.
 */
function summarizeIsolatedFeedBatchSettlements(
  settlements: PromiseSettledResult<IsolatedFeedBatchSuccess>[],
  normalizedUrls: string[],
): IsolatedFeedBatchSettlementSummary {
  const successes: IsolatedFeedBatchSuccess[] = [];
  const failedUrls = new Map<string, string>();

  for (const [index, settlement] of settlements.entries()) {
    const url = normalizedUrls[index];
    if (!url) continue;

    if (settlement.status === "fulfilled") {
      successes.push(settlement.value);
      continue;
    }

    failedUrls.set(url, toErrorMessage(settlement.reason));
  }

  return { failedUrls, successes };
}
