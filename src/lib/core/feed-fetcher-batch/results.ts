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

export function buildCachedArticleMap(options: {
  allowedUrls: string[];
  cachedArticlesByUrl: Map<string, ArticleRow[]> | undefined;
  changedArticlesByUrl: Map<string, ArticleRow[]>;
  unchangedUrls: ReadonlySet<string>;
}): Map<string, ArticleRow[]> {
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

export function buildCachedBatchResponse(options: {
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
}): BatchFeedResult {
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

export function buildFeedIdlessBatchResult(options: {
  allowedUrls: string[];
  refreshExecution: BatchRefreshExecution;
}): BatchFeedResult {
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

export function buildLastFetchedByUrl(options: {
  allowedUrls: string[];
  feedByUrl: ReadonlyMap<string, FeedRecord>;
  refreshedUrls: ReadonlySet<string>;
}): Map<string, Date> {
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

export function buildQueriedBatchResult(options: {
  articleMap: Map<string, ArticleRow[]>;
  lastFetchedByUrl: Map<string, Date>;
  query: ChangedBatchArticleQuery;
}): BatchFeedResult {
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

export function buildUnchangedBatchResult(options: {
  allowedUrlCount: number;
  lastFetchedByUrl: Map<string, Date>;
  refreshExecution: BatchRefreshExecution;
  unchangedUrls: Set<string>;
}): BatchFeedResult {
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

export function collectUnchangedUrls(options: {
  articleLimit?: number;
  knownLastFetchedAtByUrl: ReadonlyMap<string, Date> | undefined;
  lastFetchedByUrl: ReadonlyMap<string, Date>;
  urls: string[];
}): Set<string> {
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

export function createBatchFetchRequest(
  userId: number,
  feedUrls: string[],
  {
    articleFilter = "all",
    articleLimit = CONFIG.MAX_ALL_ARTICLES_LIMIT,
    forceRefresh = false,
    forceResolveUpstream = false,
    knownLastFetchedAtByUrl,
    requestSource = "unspecified",
    resolveProxyTransport,
    skipRefresh = false,
  }: BatchFetchOptions,
): BatchFetchRequest {
  return {
    articleFilter,
    articleLimit,
    feedUrls,
    forceRefresh,
    forceResolveUpstream,
    knownLastFetchedAtByUrl,
    requestSource,
    resolveProxyTransport,
    skipRefresh,
    userId,
  };
}

export function sliceArticleMapByUrls(
  articlesByUrl: ReadonlyMap<string, ArticleRow[]>,
  urls: string[],
): Map<string, ArticleRow[]> {
  return new Map(urls.map((url) => [url, articlesByUrl.get(url) ?? []]));
}
