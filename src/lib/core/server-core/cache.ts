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
 * Returns a cached batch result if one exists and is still within TTL.
 * Returns `null` on cache miss or stale entry.
 * @param userId
 * @param urls
 * @param articleFilter
 * @param articleLimit
 * @param searchTerm
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
 * Returns a cached feed-source list for a user when the entry is still fresh.
 * @param userId
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
 * Drops all cached batches for a user.
 * Call after any mutation that changes a user's feeds or articles:
 * add/delete/rename feed source, category change, article status change
 * that could affect the returned data, or upstream refresh.
 * @param userId
 */
export function invalidateUserCache(userId: number): void {
  userCaches.delete(userId);
}

/**
 * Drops the cached feed-source list for a user after feed mutations.
 * @param userId
 */
export function invalidateUserFeedSourceListCache(userId: number): void {
  userFeedSourceListCaches.delete(userId);
}

/**
 * Stores a batch result in the cache. Evicts oldest entries when full.
 * @param userId
 * @param urls
 * @param articleFilter
 * @param articleLimit
 * @param searchTerm
 * @param result
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
 * Stores the current feed-source list for a user in memory.
 * @param userId
 * @param sources
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
 * @param urls
 * @param articleFilter
 * @param articleLimit
 * @param searchTerm
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
 * @param entry
 */
function isFresh(entry: CacheEntry): boolean {
  return isTimestampFresh(entry.result.cachedAt);
}

/**
 * @param cachedAt
 */
function isTimestampFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < ttlMs();
}

/**
 * @param articleLimit
 */
function normalizeArticleLimit(articleLimit?: number): number {
  return typeof articleLimit === "number"
    ? articleLimit
    : CONFIG.MAX_ALL_ARTICLES_LIMIT;
}

/**
 *
 */
function ttlMs(): number {
  return CONFIG.FEED_CACHE_TTL_MINUTES * 60_000;
}
