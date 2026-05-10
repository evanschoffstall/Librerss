import { NextResponse } from "next/server";

import type { ArticleFilter, ArticleSortOrder } from "@/lib/core";

import { CONFIG, logger } from "@/lib";

import { buildBatchRequestLogFields } from "./log-fields";

/**
 * Describes the batch request body.
 */
export interface BatchRequestBody {
  articleFilter?: unknown;
  articleLimit?: unknown;
  articleSortOrder?: unknown;
  forceRefresh?: unknown;
  forceResolveUpstream?: unknown;
  knownLastFetchedAtByUrl?: unknown;
  requestSource?: unknown;
  searchTerm?: unknown;
  skipRefresh?: unknown;
  urls?: unknown;
}

/**
 * Describes the options for batch request completed.
 */
export interface BatchRequestCompletedOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
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

/**
 * Describes the batch request state.
 */
export interface BatchRequestState {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Map<string, Date>;
  requestSource: string;
  searchTerm: string | undefined;
  skipRefresh: boolean;
  urls: string[];
}

/**
 * Describes the batch URL descriptor.
 */
export interface BatchUrlDescriptor {
  kind: "invalid" | "valid";
  url: string;
}

/**
 * Describes the normalized batch URLs.
 */
export interface NormalizedBatchUrls {
  invalidUrlCount: number;
  normalizedUrls: string[];
  requestUrls: BatchUrlDescriptor[];
}

/**
 * Describes the options for batch intent.
 */
interface BatchIntentOptions {
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  skipRefresh: boolean;
}

/**
 * Describes the batch request state parsers.
 */
interface BatchRequestStateParsers {
  parseArticleFilter: (value: unknown) => ArticleFilter | Response;
  parseArticleLimit: (value: unknown) => number | Response | undefined;
  parseArticleSortOrder: (value: unknown) => ArticleSortOrder | Response;
  parseForceResolveUpstream: (value: unknown) => boolean | Response;
  parseKnownLastFetchedAtByUrl: (
    value: unknown,
  ) => Map<string, Date> | Response;
  parseSearchTerm: (value: unknown) => Response | string | undefined;
}

/**
 * Describes the options for invalid batch result response.
 */
interface InvalidBatchResultResponseOptions {
  diagnosticsEnabled: boolean;
  invalidUrlCount: number;
  requestUrls: BatchUrlDescriptor[];
  userId: number;
}
/**
 * Describes the options for log batch diagnostics.
 */
interface LogBatchDiagnosticsOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
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
}

/**
 * Describes the options for log batch request received.
 */
interface LogBatchRequestReceivedOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  requestSource: string | undefined;
  searchTerm: string | undefined;
  skipRefresh: boolean;
  urls: string[];
  userId: number;
}

/**
 * Describes the options for log batch request received when enabled.
 */
interface LogBatchRequestReceivedWhenEnabledOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
  diagnosticsEnabled: boolean;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  requestSource: string;
  searchTerm: string | undefined;
  skipRefresh: boolean;
  urls: string[];
  userId: number;
}

/**
 * Describes the options for log batch status summary.
 */
interface LogBatchStatusSummaryOptions {
  cachedCount: number;
  cooldownLimitedCount: number;
  intent: string;
  normalizedUrls: string[];
  refreshedCount: number;
  requestStartedAt: number;
  resolution: string;
}
/**
 * Describes the options for log batch warnings.
 */
interface LogBatchWarningsOptions {
  invalidUrlCount: number;
  upstreamErrors: Map<string, string>;
}

/**
 * Describes the options for normalized batch URLs.
 */
interface NormalizedBatchUrlsOptions {
  normalizeFeedUrl: (url: string) => string;
  urls: string[];
}

/**
 * Describes the options for validated batch request state.
 */
interface ValidatedBatchRequestStateOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
  body: BatchRequestBody;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Map<string, Date>;
  normalizeDistinctUrlList: (value: unknown) => string[];
  searchTerm: string | undefined;
}

/**
 * Build the batch intent.
 * @param options - The options used to build the batch intent.
 * @returns The batch intent.
 */
export function buildBatchIntent(options: BatchIntentOptions) {
  return options.forceResolveUpstream
    ? "dev-force"
    : options.forceRefresh
      ? "force"
      : options.skipRefresh
        ? "skip"
        : "auto";
}

/**
 * Build the invalid batch result response.
 * @param options - The options used to build the invalid batch result response.
 * @returns The invalid batch result response.
 */
export function buildInvalidBatchResultResponse(
  options: InvalidBatchResultResponseOptions,
) {
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
 * Create the batch success response.
 * @param options - The options used to create the batch success response.
 * @returns The batch success response.
 */
export function createBatchSuccessResponse(
  options: BatchRequestCompletedOptions,
) {
  return NextResponse.json(options.results, {
    status: logBatchRequestCompleted(options),
  });
}

/**
 * Process the ensure batch url count.
 * @param urls - The urls.
 * @returns The ensure batch url count.
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
 * Process the log batch diagnostics.
 * @param options - The options used to process the log batch diagnostics.
 */
export function logBatchDiagnostics(options: LogBatchDiagnosticsOptions) {
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
 * Process the log batch request completed.
 * @param options - The options used to process the log batch request completed.
 * @returns The log batch request completed.
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
 * Process the log batch request received.
 * @param options - The options used to process the log batch request received.
 */
export function logBatchRequestReceived(
  options: LogBatchRequestReceivedOptions,
) {
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
 * Process the log batch request received when enabled.
 * @param options - The options used to process the log batch request received when enabled.
 */
export function logBatchRequestReceivedWhenEnabled(
  options: LogBatchRequestReceivedWhenEnabledOptions,
) {
  if (!options.diagnosticsEnabled) {
    return;
  }

  logBatchRequestReceived({
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    articleSortOrder: options.articleSortOrder,
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
 * Process the log batch status summary.
 * @param options - The options used to process the log batch status summary.
 */
export function logBatchStatusSummary(options: LogBatchStatusSummaryOptions) {
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
 * Process the log batch warnings.
 * @param options - The options used to process the log batch warnings.
 */
export function logBatchWarnings(options: LogBatchWarningsOptions) {
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
 * Parse the batch request search term.
 * @param value - The raw search term payload.
 * @returns The trimmed search term, `undefined` when omitted, or a 400 response.
 */
export function parseBatchSearchTerm(
  value: unknown,
): Response | string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return NextResponse.json(
      {
        error: "searchTerm must be a string when provided",
      },
      { status: 400 },
    );
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return undefined;
  }

  if (normalizedValue.length > CONFIG.MAX_ARTICLE_TITLE_LENGTH) {
    return NextResponse.json(
      {
        error: `searchTerm must be at most ${CONFIG.MAX_ARTICLE_TITLE_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  return normalizedValue;
}

/**
 * Resolve the normalized batch urls.
 * @param options - The options used to resolve the normalized batch urls.
 * @returns The normalized batch urls.
 */
export function resolveNormalizedBatchUrls(
  options: NormalizedBatchUrlsOptions,
): NormalizedBatchUrls {
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
 * Process the validate batch request state.
 * @param options - The options used to process the validate batch request state.
 * @returns The validate batch request state.
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
    articleSortOrder: parsedState.articleSortOrder,
    body: options.body,
    forceResolveUpstream: parsedState.forceResolveUpstream,
    knownLastFetchedAtByUrl: parsedState.knownLastFetchedAtByUrl,
    normalizeDistinctUrlList: options.normalizeDistinctUrlList,
    searchTerm: parsedState.searchTerm,
  });
}

/**
 * Build the validated batch request state.
 * @param options - The options used to build the validated batch request state.
 * @returns The validated batch request state.
 */
function buildValidatedBatchRequestState(
  options: ValidatedBatchRequestStateOptions,
) {
  return {
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    articleSortOrder: options.articleSortOrder,
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
 * Parse the batch request state fields.
 * @param options - The options used to parse the batch request state fields.
 * @returns The batch request state fields.
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

  const articleSortOrder = options.parseArticleSortOrder(
    options.body.articleSortOrder,
  );
  if (articleSortOrder instanceof Response) {
    return articleSortOrder;
  }

  const searchTerm = options.parseSearchTerm(options.body.searchTerm);
  if (searchTerm instanceof Response) {
    return searchTerm;
  }

  return {
    articleFilter,
    articleLimit,
    articleSortOrder,
    forceResolveUpstream,
    knownLastFetchedAtByUrl,
    searchTerm,
  };
}
