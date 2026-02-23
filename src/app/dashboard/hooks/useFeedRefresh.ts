type FeedLike = { lastFetchedAt?: Date | null };

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
