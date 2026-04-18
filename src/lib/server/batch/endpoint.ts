import { NextResponse } from "next/server";

import type { ArticleFilter } from "@/lib/core";

import { CONFIG, logger } from "@/lib";

import { buildBatchRequestLogFields } from "./log-fields";

export interface BatchRequestBody {
  articleFilter?: unknown;
  articleLimit?: unknown;
  forceRefresh?: unknown;
  forceResolveUpstream?: unknown;
  knownLastFetchedAtByUrl?: unknown;
  requestSource?: unknown;
  searchTerm?: unknown;
  skipRefresh?: unknown;
  urls?: unknown;
}

export interface BatchRequestCompletedOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  cachedCount: number;
  cooldownLimitedCount: number;
  diagnosticsEnabled: boolean;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  intent: string;
  invalidUrlCount: number;
  normalizedUrls: string[];
  refreshedCount: number;
  requestSource: string | undefined;
  requestStartedAt: number;
  resolution: string;
  results: { articles: unknown[]; ok: boolean }[];
  searchTerm: string | undefined;
  skipRefresh: boolean;
  upstreamErrors: Map<string, string>;
  userId: number;
}

export interface BatchRequestState {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Map<string, Date>;
  requestSource: string;
  searchTerm: string | undefined;
  skipRefresh: boolean;
  urls: string[];
}

export interface BatchUrlDescriptor {
  kind: "invalid" | "valid";
  url: string;
}

export interface NormalizedBatchUrls {
  invalidUrlCount: number;
  normalizedUrls: string[];
  requestUrls: BatchUrlDescriptor[];
}

interface BatchRequestStateParsers {
  parseArticleFilter: (value: unknown) => ArticleFilter | Response;
  parseArticleLimit: (value: unknown) => number | Response | undefined;
  parseForceResolveUpstream: (value: unknown) => boolean | Response;
  parseKnownLastFetchedAtByUrl: (
    value: unknown,
  ) => Map<string, Date> | Response;
  parseSearchTerm: (value: unknown) => Response | string | undefined;
}

/**
 * @param options
 * @param options.forceRefresh
 * @param options.forceResolveUpstream
 * @param options.skipRefresh
 */
export function buildBatchIntent(options: {
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  skipRefresh: boolean;
}) {
  return options.forceResolveUpstream
    ? "dev-force"
    : options.forceRefresh
      ? "force"
      : options.skipRefresh
        ? "skip"
        : "auto";
}

/**
 * @param options
 * @param options.diagnosticsEnabled
 * @param options.invalidUrlCount
 * @param options.requestUrls
 * @param options.userId
 */
export function buildInvalidBatchResultResponse(options: {
  diagnosticsEnabled: boolean;
  invalidUrlCount: number;
  requestUrls: BatchUrlDescriptor[];
  userId: number;
}) {
  if (options.diagnosticsEnabled) {
    logger.info("Feed batch request had no valid URLs after normalization", {
      invalidUrlCount: options.invalidUrlCount,
      userId: options.userId,
    });
  }

  return NextResponse.json(
    options.requestUrls.map((item) => ({
      articles: [],
      error: "Invalid feed URL",
      ok: false,
      url: item.url,
    })),
    { status: 207 },
  );
}

/**
 * @param options
 */
export function createBatchSuccessResponse(
  options: BatchRequestCompletedOptions,
) {
  return NextResponse.json(options.results, {
    status: logBatchRequestCompleted(options),
  });
}

/**
 * @param urls
 */
export function ensureBatchUrlCount(urls: string[]) {
  if (urls.length <= CONFIG.FEED_BATCH_MAX_URLS) {
    return null;
  }

  return NextResponse.json(
    {
      error: `A maximum of ${CONFIG.FEED_BATCH_MAX_URLS} feed URLs can be loaded at once`,
    },
    { status: 400 },
  );
}

/**
 * @param options
 * @param options.articleFilter
 * @param options.articleLimit
 * @param options.forceRefresh
 * @param options.forceResolveUpstream
 * @param options.invalidUrlCount
 * @param options.normalizedUrls
 * @param options.requestSource
 * @param options.results
 * @param options.searchTerm
 * @param options.skipRefresh
 * @param options.upstreamErrors
 * @param options.userId
 */
export function logBatchDiagnostics(options: {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  invalidUrlCount: number;
  normalizedUrls: string[];
  requestSource: string | undefined;
  results: { articles: unknown[]; ok: boolean }[];
  searchTerm: string | undefined;
  skipRefresh: boolean;
  upstreamErrors: Map<string, string>;
  userId: number;
}) {
  logger.info("Feed batch request completed", {
    ...buildBatchRequestLogFields(options),
    invalidUrlCount: options.invalidUrlCount,
    missingCount: options.results.filter((item) => !item.ok).length,
    normalizedUrlCount: options.normalizedUrls.length,
    okCount: options.results.filter((item) => item.ok).length,
    requestSource: options.requestSource,
    searchTerm: options.searchTerm,
    skipRefresh: options.skipRefresh,
    totalArticles: options.results.reduce(
      (sum, item) => sum + item.articles.length,
      0,
    ),
    upstreamErrorCount: options.upstreamErrors.size,
    userId: options.userId,
  });
}

/**
 * @param options
 */
export function logBatchRequestCompleted(
  options: BatchRequestCompletedOptions,
) {
  const hasRequestErrors = options.invalidUrlCount > 0;
  const hasUpstreamErrors = options.upstreamErrors.size > 0;
  logBatchStatusSummary(options);
  logBatchWarnings(options);

  if (options.diagnosticsEnabled) {
    logBatchDiagnostics(options);
  }

  return hasRequestErrors || hasUpstreamErrors ? 207 : 200;
}

/**
 * @param options
 * @param options.articleFilter
 * @param options.articleLimit
 * @param options.forceRefresh
 * @param options.forceResolveUpstream
 * @param options.requestSource
 * @param options.searchTerm
 * @param options.skipRefresh
 * @param options.urls
 * @param options.userId
 */
export function logBatchRequestReceived(options: {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  requestSource: string | undefined;
  searchTerm: string | undefined;
  skipRefresh: boolean;
  urls: string[];
  userId: number;
}) {
  logger.info("Feed batch request received", {
    ...buildBatchRequestLogFields(options),
    requestedUrlCount: options.urls.length,
    requestSource: options.requestSource,
    searchTerm: options.searchTerm,
    skipRefresh: options.skipRefresh,
    userId: options.userId,
  });
}

/**
 * @param options
 * @param options.articleFilter
 * @param options.articleLimit
 * @param options.diagnosticsEnabled
 * @param options.forceRefresh
 * @param options.forceResolveUpstream
 * @param options.requestSource
 * @param options.searchTerm
 * @param options.skipRefresh
 * @param options.urls
 * @param options.userId
 */
export function logBatchRequestReceivedWhenEnabled(options: {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  diagnosticsEnabled: boolean;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  requestSource: string;
  searchTerm: string | undefined;
  skipRefresh: boolean;
  urls: string[];
  userId: number;
}) {
  if (!options.diagnosticsEnabled) {
    return;
  }

  logBatchRequestReceived({
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    forceRefresh: options.forceRefresh,
    forceResolveUpstream: options.forceResolveUpstream,
    requestSource: options.requestSource,
    searchTerm: options.searchTerm,
    skipRefresh: options.skipRefresh,
    urls: options.urls,
    userId: options.userId,
  });
}

/**
 * @param options
 * @param options.cachedCount
 * @param options.cooldownLimitedCount
 * @param options.intent
 * @param options.normalizedUrls
 * @param options.refreshedCount
 * @param options.requestStartedAt
 * @param options.resolution
 */
export function logBatchStatusSummary(options: {
  cachedCount: number;
  cooldownLimitedCount: number;
  intent: string;
  normalizedUrls: string[];
  refreshedCount: number;
  requestStartedAt: number;
  resolution: string;
}) {
  const n = options.normalizedUrls.length;
  const plural = n !== 1 ? "s" : "";
  const cooldownNote =
    options.cooldownLimitedCount > 0
      ? `, ${options.cooldownLimitedCount === n ? "all" : options.cooldownLimitedCount} throttled`
      : "";
  const durationMs = Date.now() - options.requestStartedAt;

  logger.info(
    `Batch [${n} feed${plural}]: client=${options.intent} resolved=${options.resolution} | ${options.refreshedCount} refreshed, ${options.cachedCount} cached${cooldownNote} in ${durationMs}ms`,
  );
}

/**
 * @param options
 * @param options.invalidUrlCount
 * @param options.upstreamErrors
 */
export function logBatchWarnings(options: {
  invalidUrlCount: number;
  upstreamErrors: Map<string, string>;
}) {
  if (options.upstreamErrors.size > 0) {
    const failures = [...options.upstreamErrors.entries()].map(
      ([url, err]) => `  • ${url}: ${err}`,
    );
    logger.warn(
      `Returning 207 Multi-Status — ${options.upstreamErrors.size} feed(s) have upstream errors:\n${failures.join("\n")}`,
    );
  }

  if (options.invalidUrlCount > 0) {
    logger.warn(
      `Returning 207 Multi-Status — ${options.invalidUrlCount} invalid feed URL(s) were rejected before fetch`,
    );
  }
}

/**
 * @param options
 * @param options.normalizeFeedUrl
 * @param options.urls
 */
export function resolveNormalizedBatchUrls(options: {
  normalizeFeedUrl: (url: string) => string;
  urls: string[];
}): NormalizedBatchUrls {
  const requestUrls: BatchUrlDescriptor[] = [];
  const seenNormalizedUrls = new Set<string>();

  for (const url of options.urls) {
    try {
      const normalizedUrl = options.normalizeFeedUrl(url);
      if (seenNormalizedUrls.has(normalizedUrl)) {
        continue;
      }

      seenNormalizedUrls.add(normalizedUrl);
      requestUrls.push({ kind: "valid", url: normalizedUrl });
    } catch {
      requestUrls.push({ kind: "invalid", url });
    }
  }

  return {
    invalidUrlCount: requestUrls.length - seenNormalizedUrls.size,
    normalizedUrls: [...seenNormalizedUrls],
    requestUrls,
  };
}

/**
 * @param options
 */
export function validateBatchRequestState(
  options: BatchRequestStateParsers & {
    body: BatchRequestBody;
    normalizeDistinctUrlList: (value: unknown) => string[];
  },
): BatchRequestState | Response {
  const parsedState = parseBatchRequestStateFields(options);
  if (parsedState instanceof Response) {
    return parsedState;
  }

  return buildValidatedBatchRequestState({
    articleFilter: parsedState.articleFilter,
    articleLimit: parsedState.articleLimit,
    body: options.body,
    forceResolveUpstream: parsedState.forceResolveUpstream,
    knownLastFetchedAtByUrl: parsedState.knownLastFetchedAtByUrl,
    normalizeDistinctUrlList: options.normalizeDistinctUrlList,
    searchTerm: parsedState.searchTerm,
  });
}

/**
 * @param options
 * @param options.articleFilter
 * @param options.articleLimit
 * @param options.body
 * @param options.forceResolveUpstream
 * @param options.knownLastFetchedAtByUrl
 * @param options.normalizeDistinctUrlList
 * @param options.searchTerm
 */
function buildValidatedBatchRequestState(options: {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  body: BatchRequestBody;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Map<string, Date>;
  normalizeDistinctUrlList: (value: unknown) => string[];
  searchTerm: string | undefined;
}) {
  return {
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    forceRefresh: options.body.forceRefresh === true,
    forceResolveUpstream: options.forceResolveUpstream,
    knownLastFetchedAtByUrl: options.knownLastFetchedAtByUrl,
    requestSource:
      typeof options.body.requestSource === "string"
        ? options.body.requestSource
        : "unspecified",
    searchTerm: options.searchTerm,
    skipRefresh: options.body.skipRefresh === true,
    urls: options.normalizeDistinctUrlList(options.body.urls),
  };
}

/**
 * @param options
 */
function parseBatchRequestStateFields(
  options: BatchRequestStateParsers & { body: BatchRequestBody },
) {
  const knownLastFetchedAtByUrl = options.parseKnownLastFetchedAtByUrl(
    options.body.knownLastFetchedAtByUrl,
  );
  if (knownLastFetchedAtByUrl instanceof Response) {
    return knownLastFetchedAtByUrl;
  }

  const forceResolveUpstream = options.parseForceResolveUpstream(
    options.body.forceResolveUpstream,
  );
  if (forceResolveUpstream instanceof Response) {
    return forceResolveUpstream;
  }

  const articleFilter = options.parseArticleFilter(options.body.articleFilter);
  if (articleFilter instanceof Response) {
    return articleFilter;
  }

  const articleLimit = options.parseArticleLimit(options.body.articleLimit);
  if (articleLimit instanceof Response) {
    return articleLimit;
  }

  const searchTerm = options.parseSearchTerm(options.body.searchTerm);
  if (searchTerm instanceof Response) {
    return searchTerm;
  }

  return {
    articleFilter,
    articleLimit,
    forceResolveUpstream,
    knownLastFetchedAtByUrl,
    searchTerm,
  };
}
