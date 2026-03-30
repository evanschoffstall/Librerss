import { type FeedSurfaceMode, type FeedViewportResolutionState } from "./types";

interface FeedSurfacePresentationOptions {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  searchTerm: string;
  shouldUseVirtualizedFeed: boolean;
  viewportResolutionState: FeedViewportResolutionState;
}

/** Derives the feed surface mode and stable keys from loading and viewport state. */
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

  const feedSurfaceMode: FeedSurfaceMode =
    isInitialLoading || shouldShowViewportResolutionSkeleton
      ? "skeleton"
      : showEmptyState
        ? "empty"
        : shouldUseVirtualizedFeed
          ? "virtualized"
          : "plain";

  const contentKey = isInitialLoading
    ? "feed-skeleton"
    : showEmptyState
      ? "feed-empty"
      : shouldShowViewportResolutionSkeleton
        ? "feed-viewport-skeleton"
        : "feed-content";

  return {
    contentKey,
    feedSurfaceMode,
    hasSearchTerm,
    shouldShowViewportResolutionSkeleton,
    trimmedSearchTerm,
  };
}