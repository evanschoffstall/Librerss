import type { fetchAndCacheFeedArticlesBatch } from "@/lib/core/server";

import { logger } from "@/lib";
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
  requestUrls: BatchUrlDescriptor[];
  userId: number;
}

/** Describes one successful isolated feed batch result. */
interface IsolatedFeedBatchSuccess {
  response: BatchFetchResponse;
  url: string;
}

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

  const settlements = await Promise.allSettled(
    options.normalizedUrls.map((url) =>
      options
        .fetchAndCacheFeedArticlesBatchForRoute(
          options.db,
          options.userId,
          [url],
          options.batchFetchOptions,
        )
        .then((response) => ({ response, url })),
    ),
  );
  const successes: IsolatedFeedBatchSuccess[] = [];
  const failedUrls = new Map<string, string>();

  for (const [index, settlement] of settlements.entries()) {
    const url = options.normalizedUrls[index];
    if (!url) continue;

    if (settlement.status === "fulfilled") {
      successes.push(settlement.value);
      continue;
    }

    failedUrls.set(url, toErrorMessage(settlement.reason));
  }

  if (successes.length === 0) {
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
