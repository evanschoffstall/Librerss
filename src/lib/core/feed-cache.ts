/**
 * In-memory batch article cache.
 *
 * Eliminates redundant DB queries when feeds haven't changed since the last
 * request.  The cache is per-user, keyed by the sorted set of requested URLs.
 * Entries auto-expire after the configured feed cache TTL.
 *
 * Invalidation triggers:
 *   - TTL expiry (passive, checked on read)
 *   - Any upstream feed refresh (active, via `invalidateUserCache`)
 *   - Feed add / delete / rename / category change (via `invalidateUserCache`)
 *   - Force-refresh request (caller bypasses cache)
 */

import { CONFIG } from "@/lib/config";
import type { ArticleRow } from "./feed-batch-pipeline";

// ─── Types ────────────────────────────────────────────────────────────────────

type CachedBatchResult = {
  articles: Map<string, ArticleRow[]>;
  errors: Map<string, string>;
  lastFetchedByUrl: Map<string, Date>;
  /** Epoch-ms when this entry was written. */
  cachedAt: number;
};

type CacheEntry = {
  result: CachedBatchResult;
  /** Sorted, joined URL key for quick comparison. */
  urlKey: string;
};

// ─── Cache store ──────────────────────────────────────────────────────────────

const userCaches = new Map<number, Map<string, CacheEntry>>();
const MAX_ENTRIES_PER_USER = 8;

function buildUrlKey(urls: string[]): string {
  return [...urls].sort().join("\0");
}

function ttlMs(): number {
  return (CONFIG.FEED_CACHE_TTL_MINUTES as number) * 60_000;
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.result.cachedAt < ttlMs();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a cached batch result if one exists and is still within TTL.
 * Returns `null` on cache miss or stale entry.
 */
export function getCachedBatch(
  userId: number,
  urls: string[],
): CachedBatchResult | null {
  const userMap = userCaches.get(userId);
  if (!userMap) return null;
  const key = buildUrlKey(urls);
  const entry = userMap.get(key);
  if (!entry) return null;
  if (!isFresh(entry)) {
    userMap.delete(key);
    return null;
  }
  return entry.result;
}

/** Stores a batch result in the cache. Evicts oldest entries when full. */
export function setCachedBatch(
  userId: number,
  urls: string[],
  result: Omit<CachedBatchResult, "cachedAt">,
): void {
  let userMap = userCaches.get(userId);
  if (!userMap) {
    userMap = new Map();
    userCaches.set(userId, userMap);
  }

  const key = buildUrlKey(urls);

  // Evict oldest if at capacity (simple LRU-ish: delete first inserted)
  if (userMap.size >= MAX_ENTRIES_PER_USER && !userMap.has(key)) {
    const firstKey = userMap.keys().next().value;
    if (firstKey !== undefined) userMap.delete(firstKey);
  }

  userMap.set(key, {
    urlKey: key,
    result: { ...result, cachedAt: Date.now() },
  });
}

/**
 * Drops all cached batches for a user.
 * Call after any mutation that changes a user's feeds or articles:
 * add/delete/rename feed source, category change, article status change
 * that could affect the returned data, or upstream refresh.
 */
export function invalidateUserCache(userId: number): void {
  userCaches.delete(userId);
}
