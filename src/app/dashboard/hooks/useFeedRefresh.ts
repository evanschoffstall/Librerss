/**
 * Minimal feed shape required to decide whether a refresh cooldown has elapsed.
 *
 * The dashboard keeps this deliberately narrow so callers can pass full feed
 * models, partial records, or synthetic test doubles without needing a broader
 * dependency on the full feed domain type.
 */
interface FeedLike {
  /** Timestamp of the last successful fetch, or nullish when the feed has never been loaded. */
  lastFetchedAt?: Date | null;
}

/**
 * Returns whether a feed is eligible for another refresh attempt.
 *
 * Feeds that have never been fetched are always refreshable. Otherwise the
 * function compares the elapsed wall-clock time against the minimum interval so
 * UI actions and background refresh loops can share the same cooldown rule.
 *
 * @param feed Feed-like object that may contain the last successful fetch time.
 * @param minIntervalMs Minimum cooldown, in milliseconds, between refreshes.
 * @param now Injectable current timestamp used to keep tests deterministic.
 * @returns True when the feed can be refreshed immediately.
 */
export function canRefreshFeed(
  feed: FeedLike,
  minIntervalMs: number,
  now = Date.now(),
): boolean {
  if (!feed.lastFetchedAt) {
    return true;
  }

  return now - feed.lastFetchedAt.getTime() >= minIntervalMs;
}
