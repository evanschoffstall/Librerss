import type { ArticleRow } from "@/lib/core";

import { CONFIG } from "@/lib/config";

export type { ArticleRow } from "@/lib/core";

export interface BatchFeedResolution {
  allowedUrls: string[];
  feedByUrl: Map<string, FeedRecord>;
  proxyTransport?: FeedUpstreamTransport;
}

export interface BatchFeedResult {
  articles: Map<string, ArticleRow[]>;
  cachedCount: number;
  cooldownLimitedCount: number;
  errors: Map<string, string>;
  lastFetchedByUrl: Map<string, Date>;
  refreshedCount: number;
  resolution: "cache" | "memory" | "upstream";
  unchangedUrls: Set<string>;
}

export interface BatchFetchOptions {
  articleFilter?: ArticleFilter;
  articleLimit?: number;
  forceRefresh?: boolean;
  forceResolveUpstream?: boolean;
  knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
  requestSource?: string;
  resolveProxyTransport?: () => Promise<FeedUpstreamTransport | undefined>;
  searchTerm?: string;
  skipRefresh?: boolean;
}

export interface BatchFetchRequest {
  articleFilter: ArticleFilter;
  articleLimit: number;
  feedUrls: string[];
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
  requestSource: string;
  resolveProxyTransport?: () => Promise<FeedUpstreamTransport | undefined>;
  searchTerm?: string;
  skipRefresh: boolean;
  userId: number;
}

export interface BatchRefreshExecution {
  cooldownLimitedCount: number;
  errors: Map<string, string>;
  refreshedCount: number;
  refreshedUrls: Set<string>;
}

export interface CachedBatchPayload {
  articles: Map<string, ArticleRow[]>;
  errors: Map<string, string>;
  lastFetchedByUrl: Map<string, Date>;
}

export interface ChangedBatchArticleQuery {
  batchFeeds: BatchFeedResolution;
  cached: CachedBatchPayload | null;
  changedUrls: string[];
  lastFetchedByUrl: Map<string, Date>;
  refreshExecution: BatchRefreshExecution;
  request: BatchFetchRequest;
  unchangedUrls: Set<string>;
}

export interface FeedFetchProxyOptions {
  resolveProxyTransport?: () => Promise<FeedUpstreamTransport | undefined>;
}

export interface FeedRecord {
  id: number;
  lastFetched: Date;
  lastFetchError: null | string;
  proxyEnabled?: boolean;
  url: string;
}

export interface FeedUpstreamTransport {
  allowInsecureTls?: boolean;
  proxyUrl?: string;
}

type ArticleFilter = "all" | "read" | "starred" | "unread";
interface CachedArticleMapOptions {
  allowedUrls: string[];
  cachedArticlesByUrl: Map<string, ArticleRow[]> | undefined;
  changedArticlesByUrl: Map<string, ArticleRow[]>;
  unchangedUrls: ReadonlySet<string>;
}

interface CachedBatchResponseOptions {
  allWithinCooldown: boolean;
  cached: CachedBatchPayload;
  onCacheHit: (_details: {
    articleFilter: ArticleFilter;
    articleLimit: number;
    feedCount: number;
    forceRefreshCooldownHit: boolean;
    requestSource: string;
    userId: number;
  }) => void;
  request: BatchFetchRequest;
}
interface CollectUnchangedUrlsOptions {
  articleLimit?: number;
  knownLastFetchedAtByUrl: ReadonlyMap<string, Date> | undefined;
  lastFetchedByUrl: ReadonlyMap<string, Date>;
  urls: string[];
}

interface FeedIdlessBatchResultOptions {
  allowedUrls: string[];
  refreshExecution: BatchRefreshExecution;
}

interface LastFetchedByUrlOptions {
  allowedUrls: string[];
  feedByUrl: ReadonlyMap<string, FeedRecord>;
  refreshedUrls: ReadonlySet<string>;
}
interface QueriedBatchResultOptions {
  articleMap: Map<string, ArticleRow[]>;
  lastFetchedByUrl: Map<string, Date>;
  query: ChangedBatchArticleQuery;
}

interface UnchangedBatchResultOptions {
  allowedUrlCount: number;
  lastFetchedByUrl: Map<string, Date>;
  refreshExecution: BatchRefreshExecution;
  unchangedUrls: Set<string>;
}
/**
 * Build the cached article map.
 * @param options - The options used to build the cached article map.
 * @returns The cached article map.
 */
export function buildCachedArticleMap(
  options: CachedArticleMapOptions,
): Map<string, ArticleRow[]> {
  const result = new Map(options.changedArticlesByUrl);

  for (const url of options.unchangedUrls) {
    const cachedArticles = options.cachedArticlesByUrl?.get(url);
    if (cachedArticles) {
      result.set(url, cachedArticles);
    }
  }

  return new Map(
    options.allowedUrls.map((url) => [url, result.get(url) ?? []]),
  );
}

/**
 * Build the cached batch response.
 * @param options - The options used to build the cached batch response.
 * @returns The cached batch response.
 */
export function buildCachedBatchResponse(
  options: CachedBatchResponseOptions,
): BatchFeedResult {
  const cachedCount = options.request.feedUrls.length;
  const unchangedUrls = collectUnchangedUrls({
    articleLimit: options.request.articleLimit,
    knownLastFetchedAtByUrl: options.request.knownLastFetchedAtByUrl,
    lastFetchedByUrl: options.cached.lastFetchedByUrl,
    urls: options.request.feedUrls,
  });

  options.onCacheHit({
    articleFilter: options.request.articleFilter,
    articleLimit: options.request.articleLimit,
    feedCount: cachedCount,
    forceRefreshCooldownHit: options.allWithinCooldown,
    requestSource: options.request.requestSource,
    userId: options.request.userId,
  });

  return {
    articles: sliceArticleMapByUrls(
      options.cached.articles,
      options.request.feedUrls.filter((url) => !unchangedUrls.has(url)),
    ),
    cachedCount,
    cooldownLimitedCount: options.allWithinCooldown ? cachedCount : 0,
    errors: options.cached.errors,
    lastFetchedByUrl: options.cached.lastFetchedByUrl,
    refreshedCount: 0,
    resolution: "memory",
    unchangedUrls,
  };
}
/**
 * Build the empty batch result.
 * @returns The empty batch result.
 */
export function buildEmptyBatchResult(): BatchFeedResult {
  return {
    articles: new Map(),
    cachedCount: 0,
    cooldownLimitedCount: 0,
    errors: new Map(),
    lastFetchedByUrl: new Map(),
    refreshedCount: 0,
    resolution: "cache",
    unchangedUrls: new Set(),
  };
}

/**
 * Build the feed idless batch result.
 * @param options - The options used to build the feed idless batch result.
 * @returns The feed idless batch result.
 */
export function buildFeedIdlessBatchResult(
  options: FeedIdlessBatchResultOptions,
): BatchFeedResult {
  return {
    articles: new Map(options.allowedUrls.map((url) => [url, []])),
    cachedCount:
      options.allowedUrls.length - options.refreshExecution.refreshedCount,
    cooldownLimitedCount: options.refreshExecution.cooldownLimitedCount,
    errors: options.refreshExecution.errors,
    lastFetchedByUrl: new Map(),
    refreshedCount: options.refreshExecution.refreshedCount,
    resolution:
      options.refreshExecution.refreshedCount > 0 ? "upstream" : "cache",
    unchangedUrls: new Set(),
  };
}
/**
 * Build the last fetched by url.
 * @param options - The options used to build the last fetched by url.
 * @returns The last fetched by url.
 */
export function buildLastFetchedByUrl(
  options: LastFetchedByUrlOptions,
): Map<string, Date> {
  const refreshedAt = new Date();

  return new Map(
    options.allowedUrls
      .map((url): [string, Date] | null => {
        if (options.refreshedUrls.has(url)) {
          return [url, refreshedAt];
        }

        const feed = options.feedByUrl.get(url);
        return feed ? [url, feed.lastFetched] : null;
      })
      .filter((entry): entry is [string, Date] => entry !== null),
  );
}

/**
 * Build the queried batch result.
 * @param options - The options used to build the queried batch result.
 * @returns The queried batch result.
 */
export function buildQueriedBatchResult(
  options: QueriedBatchResultOptions,
): BatchFeedResult {
  return {
    articles: options.articleMap,
    cachedCount:
      options.query.batchFeeds.allowedUrls.length -
      options.query.refreshExecution.refreshedCount,
    cooldownLimitedCount: options.query.refreshExecution.cooldownLimitedCount,
    errors: options.query.refreshExecution.errors,
    lastFetchedByUrl: options.lastFetchedByUrl,
    refreshedCount: options.query.refreshExecution.refreshedCount,
    resolution:
      options.query.refreshExecution.refreshedCount > 0 ? "upstream" : "cache",
    unchangedUrls: options.query.unchangedUrls,
  };
}
/**
 * Build the unchanged batch result.
 * @param options - The options used to build the unchanged batch result.
 * @returns The unchanged batch result.
 */
export function buildUnchangedBatchResult(
  options: UnchangedBatchResultOptions,
): BatchFeedResult {
  return {
    articles: new Map(),
    cachedCount:
      options.allowedUrlCount - options.refreshExecution.refreshedCount,
    cooldownLimitedCount: options.refreshExecution.cooldownLimitedCount,
    errors: options.refreshExecution.errors,
    lastFetchedByUrl: options.lastFetchedByUrl,
    refreshedCount: options.refreshExecution.refreshedCount,
    resolution:
      options.refreshExecution.refreshedCount > 0 ? "upstream" : "cache",
    unchangedUrls: options.unchangedUrls,
  };
}

/**
 * Process the collect unchanged urls.
 * @param options - The options used to process the collect unchanged urls.
 * @returns The collect unchanged urls.
 */
export function collectUnchangedUrls(
  options: CollectUnchangedUrlsOptions,
): Set<string> {
  if (
    !options.knownLastFetchedAtByUrl ||
    options.knownLastFetchedAtByUrl.size === 0 ||
    (typeof options.articleLimit === "number" &&
      options.articleLimit < CONFIG.MAX_ALL_ARTICLES_LIMIT)
  ) {
    return new Set();
  }

  return new Set(
    options.urls.filter((url) => {
      const knownLastFetchedAt = options.knownLastFetchedAtByUrl?.get(url);
      const currentLastFetchedAt = options.lastFetchedByUrl.get(url);

      return (
        knownLastFetchedAt instanceof Date &&
        currentLastFetchedAt instanceof Date &&
        knownLastFetchedAt.getTime() === currentLastFetchedAt.getTime()
      );
    }),
  );
}

/**
 * Create the batch fetch request.
 * @param userId - The r id.
 * @param feedUrls - The feed urls.
 * @param options - The options used to create the batch fetch request.
 * @returns The batch fetch request.
 */
export function createBatchFetchRequest(
  userId: number,
  feedUrls: string[],
  options: BatchFetchOptions,
): BatchFetchRequest {
  const {
    articleFilter = "all",
    articleLimit = CONFIG.MAX_ALL_ARTICLES_LIMIT,
    forceRefresh = false,
    forceResolveUpstream = false,
    knownLastFetchedAtByUrl,
    requestSource = "unspecified",
    resolveProxyTransport,
    searchTerm,
    skipRefresh = false,
  } = options;
  return {
    articleFilter,
    articleLimit,
    feedUrls,
    forceRefresh,
    forceResolveUpstream,
    knownLastFetchedAtByUrl,
    requestSource,
    resolveProxyTransport,
    searchTerm: searchTerm?.trim() ?? undefined,
    skipRefresh,
    userId,
  };
}

/**
 * Process the slice article map by urls.
 * @param articlesByUrl - The articles by url.
 * @param urls - The urls.
 * @returns The slice article map by urls.
 */
export function sliceArticleMapByUrls(
  articlesByUrl: ReadonlyMap<string, ArticleRow[]>,
  urls: string[],
): Map<string, ArticleRow[]> {
  return new Map(urls.map((url) => [url, articlesByUrl.get(url) ?? []]));
}
