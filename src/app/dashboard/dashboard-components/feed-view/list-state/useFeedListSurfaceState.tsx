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

interface InvertedPaginationAnchorRefContract {
  current: InvertedPaginationAnchorState | null;
}

interface UseFeedListSurfaceStateResult {
  contentKey: string;
  feedSurfaceMode: FeedSurfaceMode;
  handleViewportHostRef: (node: HTMLDivElement | null) => void;
  hasMoreArticles: boolean;
  hasSearchTerm: boolean;
  invertedPaginationAnchorRef: InvertedPaginationAnchorRefContract;
  isCachedPageRevealing: boolean;
  isInvertedScroll: boolean;
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
 * Coordinates feed-surface viewport state, pagination, and inverted anchoring.
 *
 * The heavy DOM-observer and scroll-event logic lives in dedicated helpers so
 * this hook can focus on composing the feed surface contract consumed by FeedList.
 */
export function useFeedListSurfaceState({
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
}: UseFeedListSurfaceStateOptions): UseFeedListSurfaceStateResult {
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

function buildFeedListSurfaceStateOptions(
  compositionState: ReturnType<typeof useFeedSurfaceComposition>,
  filteredFeedLength: number,
  isInvertedScroll: boolean,
) {
  return {
    feedSurfaceMode: compositionState.presentationState.feedSurfaceMode,
    filteredFeedLength,
    handleViewportHostRef: compositionState.viewportState.handleViewportHostRef,
    hasSearchTerm: compositionState.presentationState.hasSearchTerm,
    invertedPaginationAnchorRef:
      compositionState.paginationState.invertedPaginationAnchorRef,
    isCachedPageRevealing:
      compositionState.paginationState.isCachedPageRevealing,
    isInvertedScroll,
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
