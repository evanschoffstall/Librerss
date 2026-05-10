import { toast } from "sonner";

import type { getFeedBatchQueryKey } from "@/app/dashboard/dashboard-services";
import type { FeedBatchResult } from "@/app/dashboard/dashboard-services/feed-loader-state";
import type { FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";

const DASHBOARD_FEED_BATCH_SELECTION_STALE_TIME_MS = 45_000;

/**
 * Defines the feed batch query key type.
 */
type FeedBatchQueryKey = ReturnType<typeof getFeedBatchQueryKey>;
/**
 * Describes the is fresh feed batch query query client.
 */
interface IsFreshFeedBatchQueryQueryClient {
  getQueryState: (
    queryKey: FeedBatchQueryKey,
  ) => undefined | { dataUpdatedAt: number; status?: string };
}

/**
 * Return whether is fresh feed batch query.
 * @param queryClient - The query client.
 * @param queryKey - The query key.
 * @param staleTime - The stale time.
 * @returns Whether is fresh feed batch query.
 */
export function isFreshFeedBatchQuery(
  queryClient: IsFreshFeedBatchQueryQueryClient,
  queryKey: FeedBatchQueryKey,
  staleTime: number,
) {
  if (staleTime <= 0) {
    return false;
  }

  const queryState = queryClient.getQueryState(queryKey);
  if (queryState?.status !== "success") {
    return false;
  }

  return Date.now() - queryState.dataUpdatedAt < staleTime;
}

/**
 * Process the notify feed failures.
 * @param failedFeeds - The failed feeds.
 * @param totalFeedCount - The total feed count value.
 * @param sourceNamesByUrl - The source names by url.
 * @param formatFeedFailureLabel - The callback that formats the partial-outage
 *   toast description, including per-feed upstream HTTP status codes when the
 *   batch response exposed them.
 */
export function notifyFeedFailures(
  failedFeeds: FeedBatchResult[],
  totalFeedCount: number,
  sourceNamesByUrl: Map<string, string | undefined>,
  formatFeedFailureLabel: (
    failedFeeds: FeedBatchResult[],
    sourceNamesByUrl: Map<string, string | undefined>,
  ) => string,
) {
  if (failedFeeds.length === 0) {
    return;
  }

  if (failedFeeds.length === totalFeedCount) {
    toast.error("Unable to fetch feeds from upstream.", {
      description: "Try another feed or check back after the next refresh.",
    });
    return;
  }

  const failureDescription = formatFeedFailureLabel(
    failedFeeds,
    sourceNamesByUrl,
  );
  toast.warning(`Some feeds failed to update`, {
    description: failureDescription,
  });
}

/**
 * Resolve the feed batch stale time.
 * @param options - The options used to resolve the feed batch stale time.
 * @returns The feed batch stale time.
 */
export function resolveFeedBatchStaleTime(options?: FeedFetchOptions) {
  if (options?.forceRefresh === true) {
    return 0;
  }

  if (options?.skipRefresh === true) {
    return 60_000;
  }

  if (
    options?.requestSource === "auto-refresh" ||
    options?.requestSource === "manual-refresh"
  ) {
    return 0;
  }

  return DASHBOARD_FEED_BATCH_SELECTION_STALE_TIME_MS;
}

/**
 * Return whether should notify feed failure toast.
 * @param options - The options used to return whether should notify feed failure toast.
 * @param isBackground - Whether is background.
 * @returns Whether should notify feed failure toast.
 */
export function shouldNotifyFeedFailureToast(
  options?: FeedFetchOptions,
  isBackground = false,
) {
  return !isBackground && options?.skipRefresh !== true;
}
