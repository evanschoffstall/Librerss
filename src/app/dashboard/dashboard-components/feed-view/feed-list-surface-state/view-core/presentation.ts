import {
  type FeedSurfaceMode,
  type FeedViewportResolutionState,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core/types";

/**
 * Describes the options for feed surface content key.
 */
interface FeedSurfaceContentKeyOptions {
  isInitialLoading: boolean;
  shouldShowViewportResolutionSkeleton: boolean;
  showEmptyState: boolean;
}

/**
 * Describes the options for feed surface mode.
 */
interface FeedSurfaceModeOptions {
  isInitialLoading: boolean;
  shouldShowViewportResolutionSkeleton: boolean;
  shouldUseVirtualizedFeed: boolean;
  showEmptyState: boolean;
}
/**
 * Describes the options for feed surface presentation.
 */
interface FeedSurfacePresentationOptions {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  searchTerm: string;
  shouldUseVirtualizedFeed: boolean;
  viewportResolutionState: FeedViewportResolutionState;
}

/**
 * Build the feed surface presentation state.
 * @param options - The options used to build the feed surface presentation state.
 * @returns The feed surface presentation state.
 */
export function buildFeedSurfacePresentationState(
  options: FeedSurfacePresentationOptions,
) {
  const {
    filteredFeedLength,
    isInitialLoading,
    searchTerm,
    shouldUseVirtualizedFeed,
    viewportResolutionState,
  } = options;
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
 * Resolve the feed surface content key.
 * @param options - The options used to resolve the feed surface content key.
 * @returns The feed surface content key.
 */
function resolveFeedSurfaceContentKey(options: FeedSurfaceContentKeyOptions) {
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
 * Resolve the feed surface mode.
 * @param options - The options used to resolve the feed surface mode.
 * @returns The feed surface mode.
 */
function resolveFeedSurfaceMode(
  options: FeedSurfaceModeOptions,
): FeedSurfaceMode {
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
