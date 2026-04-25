/**
 * In-memory feed caches.
 *
 * Two per-user caches live here:
 * - Batch article results keyed by the requested URL-set, article filter, and article window
 * - Feed-source list results keyed only by user ID.
 *
 * Both caches share the same TTL because they serve the same dashboard boot
 * path and should age out together under the same freshness budget.
 */

import type { ArticleFilter } from "@/lib/core";
import type { ArticleRow } from "@/lib/core/feed-batch-pipeline";
import type { FeedSourceListRow } from "@/lib/types";

import { CONFIG } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CachedBatchResult {
  articles: Map<string, ArticleRow[]>;
  /** Epoch-ms when this entry was written. */
  cachedAt: number;
  errors: Map<string, string>;
  lastFetchedByUrl: Map<string, Date>;
}

interface CachedFeedSourceListResult {
  /** Epoch-ms when this entry was written. */
  cachedAt: number;
  sources: FeedSourceListRow[];
}

interface CacheEntry {
  result: CachedBatchResult;
  /** Sorted, joined URL key for quick comparison. */
  urlKey: string;
}

// ─── Cache store ──────────────────────────────────────────────────────────────

const userCaches = new Map<number, Map<string, CacheEntry>>();
const userFeedSourceListCaches = new Map<number, CachedFeedSourceListResult>();
const MAX_ENTRIES_PER_USER = 8;

/**
 * Return the cached batch.
 * @param userId - The r id.
 * @param urls - The urls.
 * @param articleFilter - The article filter.
 * @param articleLimit - The article limit.
 * @param searchTerm - The search term.
 * @returns The cached batch.
 */
export function getCachedBatch(
  userId: number,
  urls: string[],
  articleFilter: ArticleFilter,
  articleLimit?: number,
  searchTerm?: string,
): CachedBatchResult | null {
  const userMap = userCaches.get(userId);
  if (!userMap) return null;
  const key = buildUrlKey(urls, articleFilter, articleLimit, searchTerm);
  const entry = userMap.get(key);
  if (!entry) return null;
  if (!isFresh(entry)) {
    userMap.delete(key);
    return null;
  }
  return entry.result;
}

/**
 * Return the cached feed source list.
 * @param userId - The r id.
 * @returns The cached feed source list.
 */
export function getCachedFeedSourceList(
  userId: number,
): FeedSourceListRow[] | null {
  const entry = userFeedSourceListCaches.get(userId);
  if (!entry) {
    return null;
  }

  if (!isTimestampFresh(entry.cachedAt)) {
    userFeedSourceListCaches.delete(userId);
    return null;
  }

  return entry.sources;
}

/**
 * Process the invalidate user cache.
 * @param userId - The r id.
 */
export function invalidateUserCache(userId: number): void {
  userCaches.delete(userId);
}

/**
 * Process the invalidate user feed source list cache.
 * @param userId - The r id.
 */
export function invalidateUserFeedSourceListCache(userId: number): void {
  userFeedSourceListCaches.delete(userId);
}

/**
 * Process the set cached batch.
 * @param userId - The r id.
 * @param urls - The urls.
 * @param articleFilter - The article filter.
 * @param articleLimit - The article limit.
 * @param searchTerm - The search term.
 * @param result - The result.
 */
export function setCachedBatch(
  userId: number,
  urls: string[],
  articleFilter: ArticleFilter,
  articleLimit: number | undefined,
  searchTerm: string | undefined,
  result: Omit<CachedBatchResult, "cachedAt">,
): void {
  let userMap = userCaches.get(userId);
  if (!userMap) {
    userMap = new Map();
    userCaches.set(userId, userMap);
  }

  const key = buildUrlKey(urls, articleFilter, articleLimit, searchTerm);

  // Evict oldest if at capacity (simple LRU-ish: delete first inserted)
  if (userMap.size >= MAX_ENTRIES_PER_USER && !userMap.has(key)) {
    const firstKey = userMap.keys().next().value;
    if (firstKey !== undefined) userMap.delete(firstKey);
  }

  userMap.set(key, {
    result: { ...result, cachedAt: Date.now() },
    urlKey: key,
  });
}

/**
 * Process the set cached feed source list.
 * @param userId - The r id.
 * @param sources - The sources.
 */
export function setCachedFeedSourceList(
  userId: number,
  sources: FeedSourceListRow[],
): void {
  userFeedSourceListCaches.set(userId, {
    cachedAt: Date.now(),
    sources,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the url key.
 * @param urls - The urls.
 * @param articleFilter - The article filter.
 * @param articleLimit - The article limit.
 * @param searchTerm - The search term.
 * @returns The url key.
 */
function buildUrlKey(
  urls: string[],
  articleFilter: ArticleFilter,
  articleLimit?: number,
  searchTerm?: string,
): string {
  return `${articleFilter}\0${normalizeArticleLimit(articleLimit)}\0${searchTerm?.trim() ?? ""}\0${[...urls].sort().join("\0")}`;
}

/**
 * Return whether is fresh.
 * @param entry - The entry.
 * @returns Whether is fresh.
 */
function isFresh(entry: CacheEntry): boolean {
  return isTimestampFresh(entry.result.cachedAt);
}

/**
 * Return whether is timestamp fresh.
 * @param cachedAt - The cached at.
 * @returns Whether is timestamp fresh.
 */
function isTimestampFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < ttlMs();
}

/**
 * Normalize the article limit.
 * @param articleLimit - The article limit.
 * @returns The article limit.
 */
function normalizeArticleLimit(articleLimit?: number): number {
  return typeof articleLimit === "number"
    ? articleLimit
    : CONFIG.MAX_ALL_ARTICLES_LIMIT;
}

/**
 * Process the ttl ms.
 * @returns The ttl ms.
 */
function ttlMs(): number {
  return CONFIG.FEED_CACHE_TTL_MINUTES * 60_000;
}
