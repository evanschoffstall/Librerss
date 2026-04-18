import {
  type FeedSurfaceMode,
  type FeedViewportResolutionState,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core/types";

interface FeedSurfacePresentationOptions {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  searchTerm: string;
  shouldUseVirtualizedFeed: boolean;
  viewportResolutionState: FeedViewportResolutionState;
}

/**
 * Derives the feed surface mode and stable keys from loading and viewport state.
 * @param root0
 * @param root0.filteredFeedLength
 * @param root0.isInitialLoading
 * @param root0.searchTerm
 * @param root0.shouldUseVirtualizedFeed
 * @param root0.viewportResolutionState
 */
export function buildFeedSurfacePresentationState({
  filteredFeedLength,
  isInitialLoading,
  searchTerm,
  shouldUseVirtualizedFeed,
  viewportResolutionState,
}: FeedSurfacePresentationOptions) {
  const trimmedSearchTerm = searchTerm.trim();
  const hasSearchTerm = trimmedSearchTerm.length > 0;
  const shouldShowViewportResolutionSkeleton =
    !isInitialLoading &&
    filteredFeedLength > 0 &&
    viewportResolutionState === "pending";
  const showEmptyState = !isInitialLoading && filteredFeedLength === 0;
  const feedSurfaceMode = resolveFeedSurfaceMode({
    isInitialLoading,
    shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed,
    showEmptyState,
  });
  const contentKey = resolveFeedSurfaceContentKey({
    isInitialLoading,
    shouldShowViewportResolutionSkeleton,
    showEmptyState,
  });

  return {
    contentKey,
    feedSurfaceMode,
    hasSearchTerm,
    shouldShowViewportResolutionSkeleton,
    trimmedSearchTerm,
  };
}

/**
 * @param options
 * @param options.isInitialLoading
 * @param options.shouldShowViewportResolutionSkeleton
 * @param options.showEmptyState
 */
function resolveFeedSurfaceContentKey(options: {
  isInitialLoading: boolean;
  shouldShowViewportResolutionSkeleton: boolean;
  showEmptyState: boolean;
}) {
  if (options.isInitialLoading) {
    return "feed-skeleton";
  }

  if (options.showEmptyState) {
    return "feed-empty";
  }

  return options.shouldShowViewportResolutionSkeleton
    ? "feed-viewport-skeleton"
    : "feed-content";
}

/**
 * @param options
 * @param options.isInitialLoading
 * @param options.shouldShowViewportResolutionSkeleton
 * @param options.shouldUseVirtualizedFeed
 * @param options.showEmptyState
 */
function resolveFeedSurfaceMode(options: {
  isInitialLoading: boolean;
  shouldShowViewportResolutionSkeleton: boolean;
  shouldUseVirtualizedFeed: boolean;
  showEmptyState: boolean;
}): FeedSurfaceMode {
  if (
    options.isInitialLoading ||
    options.shouldShowViewportResolutionSkeleton
  ) {
    return "skeleton";
  }

  if (options.showEmptyState) {
    return "empty";
  }

  return options.shouldUseVirtualizedFeed ? "virtualized" : "plain";
}
