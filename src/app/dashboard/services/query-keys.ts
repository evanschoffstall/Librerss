import type { QueryClient } from "@tanstack/react-query";

import type { FeedFetchOptions } from "@/app/dashboard/services/selection";

/** Query-key root for cached feed source trees. */
const DASHBOARD_FEED_SOURCE_TREE_QUERY_KEY = [
  "dashboard",
  "feed-source-tree",
] as const;

/** Query-key root for cached feed batch responses. */
const DASHBOARD_FEED_BATCH_QUERY_KEY = ["dashboard", "feed-batch"] as const;

/**
 * Return the shared query-key root for cached dashboard feed batches.
 * @returns Query-key prefix used for dashboard feed-batch cache entries.
 */
export function getDashboardFeedBatchQueryKeyRoot() {
  return DASHBOARD_FEED_BATCH_QUERY_KEY;
}

/**
 * Return the feed batch query key.
 * @param requestSignature - The request signature.
 * @param options - The options used to return the feed batch query key.
 * @returns The feed batch query key.
 */
export function getFeedBatchQueryKey(
  requestSignature: string,
  options?: Pick<
    FeedFetchOptions,
    | "articleFilter"
    | "articleLimit"
    | "articleSortOrder"
    | "knownLastFetchedAtByUrl"
    | "searchTerm"
    | "skipRefresh"
  >,
) {
  return [
    ...DASHBOARD_FEED_BATCH_QUERY_KEY,
    requestSignature,
    options?.articleFilter ?? "all",
    options?.articleSortOrder ?? "newest",
    options?.articleLimit ?? "all-articles",
    options?.searchTerm?.trim() ?? "",
    options?.skipRefresh === true ? "skip-refresh" : "refresh",
    serializeKnownLastFetchedAt(options?.knownLastFetchedAtByUrl),
  ] as const;
}

/**
 * Return the feed source tree query key.
 * @param usePlaceholderData - The placeholder data.
 * @returns The feed source tree query key.
 */
export function getFeedSourceTreeQueryKey(usePlaceholderData: boolean) {
  return [
    ...DASHBOARD_FEED_SOURCE_TREE_QUERY_KEY,
    usePlaceholderData ? "placeholder" : "live",
  ] as const;
}

/**
 * Invalidate every cached dashboard feed-batch query after a local article
 * status mutation settles so React Query refreshes any optimistic cache patch.
 * @param queryClient - React Query client that owns the dashboard feed cache.
 */
export async function invalidateDashboardFeedBatchQueries(
  queryClient: Pick<QueryClient, "invalidateQueries">,
) {
  await queryClient.invalidateQueries({
    queryKey: getDashboardFeedBatchQueryKeyRoot(),
  });
}

/**
 * Process the serialize known last fetched at.
 * @param lastFetchedAtByUrl - The last fetched at by url.
 * @returns The serialize known last fetched at.
 */
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
