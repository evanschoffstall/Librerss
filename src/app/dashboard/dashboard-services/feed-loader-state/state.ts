import { toast } from "sonner";

import type { FeedBatchResult } from "@/app/dashboard/dashboard-services/feed-loader-state";
import type { FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";

import { getFeedBatchQueryKey } from "@/app/dashboard/dashboard-services";

const DASHBOARD_FEED_BATCH_SELECTION_STALE_TIME_MS = 45_000;

type FeedBatchQueryKey = ReturnType<typeof getFeedBatchQueryKey>;

export function isFreshFeedBatchQuery(
  queryClient: {
    getQueryState: (
      queryKey: FeedBatchQueryKey,
    ) => undefined | { dataUpdatedAt: number; status?: string };
  },
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

  const failureLabel = formatFeedFailureLabel(failedFeeds, sourceNamesByUrl);
  toast.warning(`Some feeds failed to update`, {
    description: failureLabel,
  });
}

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
 * Skip-refresh requests intentionally reuse cached feed state, so foreground
 * failure toasts should stay silent even if cached metadata still includes
 * upstream errors from an earlier refresh.
 */
export function shouldNotifyFeedFailureToast(
  options?: FeedFetchOptions,
  isBackground = false,
) {
  return !isBackground && options?.skipRefresh !== true;
}
