import type { FeedFetchOptions } from "./selection";

/** Query-key root for cached feed source trees. */
const DASHBOARD_FEED_SOURCE_TREE_QUERY_KEY = [
  "dashboard",
  "feed-source-tree",
] as const;

/** Query-key root for cached feed batch responses. */
const DASHBOARD_FEED_BATCH_QUERY_KEY = ["dashboard", "feed-batch"] as const;

/**
 * Builds the feed-batch query key used to dedupe and cache selection fetches.
 */
export function getFeedBatchQueryKey(
  requestSignature: string,
  options?: Pick<
    FeedFetchOptions,
    "articleFilter" | "knownLastFetchedAtByUrl" | "skipRefresh"
  >,
) {
  return [
    ...DASHBOARD_FEED_BATCH_QUERY_KEY,
    requestSignature,
    options?.articleFilter ?? "all",
    options?.skipRefresh === true ? "skip-refresh" : "refresh",
    serializeKnownLastFetchedAt(options?.knownLastFetchedAtByUrl),
  ] as const;
}

/** Builds the source-tree query key for live or placeholder dashboard mode. */
export function getFeedSourceTreeQueryKey(usePlaceholderData: boolean) {
  return [
    ...DASHBOARD_FEED_SOURCE_TREE_QUERY_KEY,
    usePlaceholderData ? "placeholder" : "live",
  ] as const;
}

/** Serializes the known last-fetched map into a stable query-key fragment. */
function serializeKnownLastFetchedAt(
  lastFetchedAtByUrl?: ReadonlyMap<string, Date>,
) {
  if (!lastFetchedAtByUrl || lastFetchedAtByUrl.size === 0) {
    return "";
  }

  return [...lastFetchedAtByUrl.entries()]
    .sort(([leftUrl], [rightUrl]) => leftUrl.localeCompare(rightUrl))
    .map(([url, lastFetchedAt]) => `${url}@${lastFetchedAt.toISOString()}`)
    .join("|");
}
