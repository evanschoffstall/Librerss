import { useCallback } from "react";

import { applyFeedSurfaceLayoutToHost } from "@/app/dashboard/components/feed-view/feed-list-surface-state";

/** Options used to connect the feed surface element to viewport state. */
interface UseFeedSurfaceHostRefOptions {
  handleViewportHostRef: (node: HTMLDivElement | null) => void;
  shouldShowFeedSkeleton: boolean;
  showEmptyState: boolean;
}

/**
 * Resolve whether FeedList should render skeleton or empty placeholder content.
 * @param isInitialLoading - Whether the article surface is still loading for the first time.
 * @param isDataRefreshing - Whether refresh or search work is in progress.
 * @param shouldShowViewportResolutionSkeleton - Whether viewport auto-resolution still needs skeletons.
 * @param filteredFeedLength - The current filtered article count.
 * @returns The placeholder rendering flags for FeedList.
 */
export function resolveFeedPlaceholderState(
  isInitialLoading: boolean,
  isDataRefreshing: boolean,
  shouldShowViewportResolutionSkeleton: boolean,
  filteredFeedLength: number,
) {
  const shouldShowFeedSkeleton =
    isInitialLoading ||
    shouldShowViewportResolutionSkeleton ||
    (isDataRefreshing && filteredFeedLength === 0);

  return {
    shouldShowFeedSkeleton,
    showEmptyState: !shouldShowFeedSkeleton && filteredFeedLength === 0,
  };
}

/**
 * Build the feed surface ref callback that connects FeedList to its viewport host.
 * @param options - Surface and placeholder state used by the ref callback.
 * @returns A stable ref callback for the feed surface host.
 */
export function useFeedSurfaceHostRef(options: UseFeedSurfaceHostRefOptions) {
  const { handleViewportHostRef, shouldShowFeedSkeleton, showEmptyState } =
    options;

  return useCallback(
    (node: HTMLDivElement | null) => {
      applyFeedSurfaceLayoutToHost(node);

      if (shouldShowFeedSkeleton || showEmptyState) {
        handleViewportHostRef(null);
        return;
      }

      handleViewportHostRef(node);
    },
    [handleViewportHostRef, shouldShowFeedSkeleton, showEmptyState],
  );
}
