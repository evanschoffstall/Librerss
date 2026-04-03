import {
  useCallback,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { FEED_MIN_SCROLLABLE_OVERFLOW_PX } from "./feed-list-surface-state/constants";
import {
  findTopVisibleInvertedPaginationAnchorArticleKey,
  findVisibleInvertedRemovalAnchorArticleKey,
  shouldAutoAnchorInvertedScrollViewport,
} from "./feed-list-surface-state/dom";
import { buildFeedSurfacePresentationState } from "./feed-list-surface-state/presentation";
import {
  type FeedSurfaceMode,
  type UseFeedListSurfaceStateOptions,
} from "./feed-list-surface-state/types";
import { useFeedPagination } from "./feed-list-surface-state/useFeedPagination";
import { useFeedViewportState } from "./feed-list-surface-state/useFeedViewportState";
import { useInvertedExpansionScrollLock } from "./feed-list-surface-state/useInvertedExpansionScrollLock";

export {
  findTopVisibleInvertedPaginationAnchorArticleKey,
  findVisibleInvertedRemovalAnchorArticleKey,
  shouldAutoAnchorInvertedScrollViewport,
};

interface FeedSurfacePresentationContract {
  contentKey: string;
  feedSurfaceMode: FeedSurfaceMode;
  hasSearchTerm: boolean;
  shouldShowViewportResolutionSkeleton: boolean;
  trimmedSearchTerm: string;
}

interface InvertedPaginationAnchorContract {
  initialScrollHeight: number;
  initialScrollTop: number;
  releaseAt: number;
}

interface InvertedPaginationAnchorRefContract {
  current: InvertedPaginationAnchorContract | null;
}

interface UseFeedListSurfaceStateResult {
  contentKey: string;
  feedSurfaceMode: FeedSurfaceMode;
  handleViewportHostRef: (node: HTMLDivElement | null) => void;
  hasMoreArticles: boolean;
  hasSearchTerm: boolean;
  invertedPaginationAnchorRef: InvertedPaginationAnchorRefContract;
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
  const [, setHasClaimedInvertedScrollOwnership] = useState(false);
  const hasUserScrolledRef = useRef(false);
  const hasClaimedInvertedScrollOwnershipRef = useRef(false);

  const {
    clearInitialNormalScrollLock,
    handleViewportHostRef,
    scrollViewport,
    shouldLockInitialNormalScroll,
    viewportResolutionState,
  } = useFeedViewportState({
    feedViewKey,
    isCollapseScrollRestoreActive,
    isInvertedScroll,
    refreshEpoch,
  });

  const claimInvertedScrollOwnership = useCallback((): void => {
    hasUserScrolledRef.current = true;

    if (hasClaimedInvertedScrollOwnershipRef.current) {
      return;
    }

    hasClaimedInvertedScrollOwnershipRef.current = true;

    flushSync(() => {
      setHasClaimedInvertedScrollOwnership(true);
    });
  }, []);

  const resetInvertedScrollOwnership = useCallback((): void => {
    hasClaimedInvertedScrollOwnershipRef.current = false;
    setHasClaimedInvertedScrollOwnership(false);
  }, []);

  const shouldAnchorUnderfilledInvertedViewport = useCallback(() => {
    if (!scrollViewport) {
      return false;
    }

    let scrollableOverflowPx: number;

    try {
      scrollableOverflowPx =
        scrollViewport.scrollHeight - scrollViewport.clientHeight;
    } catch {
      return false;
    }

    return (
      Number.isFinite(scrollableOverflowPx) &&
      scrollableOverflowPx <= FEED_MIN_SCROLLABLE_OVERFLOW_PX
    );
  }, [scrollViewport]);

  const invertedExpansionScrollLock: {
    hasActiveInvertedExpansionScrollLock: () => boolean;
    releaseInvertedExpansionScrollLock: () => void;
    syncInvertedExpansionScrollLock: () => void;
  } = useInvertedExpansionScrollLock({
    articleFilter,
    collapsingArticles,
    expandedArticleKey,
    getPreExpandViewportSnapshot,
    isInvertedScroll,
    onClaimInvertedScrollOwnership: claimInvertedScrollOwnership,
    scrollViewport,
  });

  const {
    hasActiveInvertedExpansionScrollLock,
    releaseInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
  } = invertedExpansionScrollLock;

  const paginationState: {
    invertedPaginationAnchorRef: InvertedPaginationAnchorRefContract;
    loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
    maybeAutoFillViewport: (committedListHeight?: number) => void;
    shouldUseVirtualizedFeed: boolean;
    syncInvertedPaginationAnchor: () => void;
    visibleArticleCount: number;
  } = useFeedPagination({
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer,
    clearInitialNormalScrollLock,
    feedViewKey,
    filteredFeedLength,
    hasActiveInvertedExpansionScrollLock,
    hasCollapsingArticles: Object.keys(collapsingArticles).length > 0,
    hasUserScrolledRef,
    isInitialLoading,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    onClaimInvertedScrollOwnership: claimInvertedScrollOwnership,
    onLoadMore,
    onReleaseInvertedExpansionScrollLock: releaseInvertedExpansionScrollLock,
    onResetInvertedScrollOwnership: resetInvertedScrollOwnership,
    onSyncInvertedExpansionScrollLock: syncInvertedExpansionScrollLock,
    refreshEpoch,
    scrollViewport,
    searchTerm,
    shouldLockInitialNormalScroll,
  });

  const {
    invertedPaginationAnchorRef,
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    shouldUseVirtualizedFeed,
    syncInvertedPaginationAnchor,
    visibleArticleCount,
  } = paginationState;

  const shouldAutoAnchor = useCallback(() => {
    const hasClaimedScrollOwnership = hasClaimedInvertedScrollOwnershipRef.current;

    return shouldAutoAnchorInvertedScrollViewport({
      expandedArticleKey,
      hasClaimedInvertedScrollOwnership: hasClaimedScrollOwnership,
      isInvertedScroll,
      isUnderfilledInvertedViewport:
        !hasClaimedScrollOwnership && shouldAnchorUnderfilledInvertedViewport(),
    });
  }, [
    expandedArticleKey,
    isInvertedScroll,
    shouldAnchorUnderfilledInvertedViewport,
  ]);

  const presentationState: FeedSurfacePresentationContract = buildFeedSurfacePresentationState({
    filteredFeedLength,
    isInitialLoading,
    searchTerm,
    shouldUseVirtualizedFeed,
    viewportResolutionState,
  });

  const {
    contentKey,
    feedSurfaceMode,
    hasSearchTerm,
    shouldShowViewportResolutionSkeleton,
    trimmedSearchTerm,
  } = presentationState;

  const hasMoreArticles = visibleArticleCount < filteredFeedLength;

  return {
    contentKey,
    feedSurfaceMode,
    handleViewportHostRef,
    hasMoreArticles,
    hasSearchTerm,
    invertedPaginationAnchorRef,
    isInvertedScroll,
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    scrollViewport,
    shouldAutoAnchorInvertedScroll: shouldAutoAnchor,
    shouldLockInitialNormalScroll,
    shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed,
    syncInvertedExpansionScrollLock,
    syncInvertedPaginationAnchor,
    trimmedSearchTerm,
    visibleArticleCount,
  };
}