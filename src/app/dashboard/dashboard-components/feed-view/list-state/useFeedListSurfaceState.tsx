import type {
  FeedSurfaceMode,
  InvertedPaginationAnchorState,
  UseFeedListSurfaceStateOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state";

import {
  findTopVisibleInvertedPaginationAnchorArticleKey,
  findVisibleInvertedRemovalAnchorArticleKey,
  shouldAutoAnchorInvertedScrollViewport,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import {
  buildFeedListSurfaceStateResult,
  useFeedSurfaceComposition,
} from "@/app/dashboard/dashboard-components/feed-view/list-state/useFeedListSurfaceComposition";

export {
  findTopVisibleInvertedPaginationAnchorArticleKey,
  findVisibleInvertedRemovalAnchorArticleKey,
  shouldAutoAnchorInvertedScrollViewport,
};

/**
     * Describes the inverted pagination anchor ref contract.
     */
interface InvertedPaginationAnchorRefContract {
  current: InvertedPaginationAnchorState | null;
}

/**
 * Describes the use feed list surface state result.
 */
interface UseFeedListSurfaceStateResult {
  contentKey: string;
  feedSurfaceMode: FeedSurfaceMode;
  handleViewportHostRef: (node: HTMLDivElement | null) => void;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasMoreArticles: boolean;
  hasSearchTerm: boolean;
  invertedPaginationAnchorRef: InvertedPaginationAnchorRefContract;
  isCachedPageRevealing: boolean;
  isInvertedScroll: boolean;
  isPendingServerRevealVisible: boolean;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
  scrollViewport: HTMLElement | null;
  shouldAutoAnchorInvertedScroll: () => boolean;
  shouldLockInitialNormalScroll: () => boolean;
  shouldShowViewportResolutionSkeleton: boolean;
  shouldUseVirtualizedFeed: boolean;
  syncInvertedExpansionScrollLock: () => void;
  syncInvertedPaginationAnchor: () => void;
  trimmedSearchTerm: string;
  visibleArticleCount: number;
}

/**
 * Manage the feed list surface state.
 * @param options - The options used to manage the feed list surface state.
 * @returns The feed list surface state state and callbacks.
 */
export function useFeedListSurfaceState(
  options: UseFeedListSurfaceStateOptions,
): UseFeedListSurfaceStateResult {
  const {
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer,
    collapsingArticles,
    expandedArticleKey,
    feedViewKey,
    filteredFeedLength,
    getPreExpandViewportSnapshot,
    invertedScrollAnchorIndex: _invertedScrollAnchorIndex,
    isCollapseScrollRestoreActive,
    isInitialLoading,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    onLoadMore,
    refreshEpoch,
    searchTerm,
  } = options;
  const compositionState = useFeedSurfaceComposition({
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer,
    collapsingArticles,
    expandedArticleKey,
    feedViewKey,
    filteredFeedLength,
    getPreExpandViewportSnapshot,
    isCollapseScrollRestoreActive,
    isInitialLoading,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    onLoadMore,
    refreshEpoch,
    searchTerm,
  });

  return buildFeedListSurfaceStateResult(
    buildFeedListSurfaceStateOptions(
      compositionState,
      filteredFeedLength,
      isInvertedScroll,
    ),
  );
}

/**
 * Build the feed list surface state options.
 * @param compositionState - The callback that composition state.
 * @param filteredFeedLength - The filtered feed length value.
 * @param isInvertedScroll - Whether is inverted scroll.
 * @returns The feed list surface state options.
 */
function buildFeedListSurfaceStateOptions(
  compositionState: ReturnType<typeof useFeedSurfaceComposition>,
  filteredFeedLength: number,
  isInvertedScroll: boolean,
) {
  return {
    feedSurfaceMode: compositionState.presentationState.feedSurfaceMode,
    filteredFeedLength,
    handleViewportHostRef: compositionState.viewportState.handleViewportHostRef,
    hasActiveInvertedExpansionScrollLock:
      compositionState.expansionLockState.hasActiveInvertedExpansionScrollLock,
    hasSearchTerm: compositionState.presentationState.hasSearchTerm,
    invertedPaginationAnchorRef:
      compositionState.paginationState.invertedPaginationAnchorRef,
    isCachedPageRevealing:
      compositionState.paginationState.isCachedPageRevealing,
    isInvertedScroll,
    isPendingServerRevealVisible:
      compositionState.paginationState.isPendingServerRevealVisible,
    loadMoreSentinelRef: compositionState.paginationState.loadMoreSentinelRef,
    maybeAutoFillViewport:
      compositionState.paginationState.maybeAutoFillViewport,
    scrollViewport: compositionState.viewportState.scrollViewport,
    shouldAutoAnchor: compositionState.shouldAutoAnchor,
    shouldLockInitialNormalScroll:
      compositionState.viewportState.shouldLockInitialNormalScroll,
    shouldShowViewportResolutionSkeleton:
      compositionState.presentationState.shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed:
      compositionState.paginationState.shouldUseVirtualizedFeed,
    syncInvertedExpansionScrollLock:
      compositionState.expansionLockState.syncInvertedExpansionScrollLock,
    syncInvertedPaginationAnchor:
      compositionState.paginationState.syncInvertedPaginationAnchor,
    trimmedSearchTerm: compositionState.presentationState.trimmedSearchTerm,
    visibleArticleCount: compositionState.paginationState.visibleArticleCount,
  };
}
