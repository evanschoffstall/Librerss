import {
  type ComponentPropsWithRef,
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import { FEED_MIN_SCROLLABLE_OVERFLOW_PX } from "./feed-list-surface-state/constants";
import {
  findVisibleInvertedRemovalAnchorArticleKey,
  shouldAutoAnchorInvertedScrollViewport,
} from "./feed-list-surface-state/dom";
import { buildFeedSurfacePresentationState } from "./feed-list-surface-state/presentation";
import { type UseFeedListSurfaceStateOptions } from "./feed-list-surface-state/types";
import { useFeedPagination } from "./feed-list-surface-state/useFeedPagination";
import { useFeedViewportState } from "./feed-list-surface-state/useFeedViewportState";
import { useInvertedExpansionScrollLock } from "./feed-list-surface-state/useInvertedExpansionScrollLock";


export {
  findVisibleInvertedRemovalAnchorArticleKey,
  shouldAutoAnchorInvertedScrollViewport,
};

const VirtuosoFeedItem = forwardRef<HTMLDivElement, ComponentPropsWithRef<"div">>(
  function VirtuosoFeedItem(props, ref) {
    return <div {...props} ref={ref} style={{ ...props.style, minHeight: 1 }} />;
  },
);

interface RenderLoadMoreBoundaryOptions {
  canLoadMoreFromServer: boolean;
  hasMoreArticles: boolean;
  loadMoreSentinelRef: { current: HTMLDivElement | null };
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
  invertedScrollAnchorIndex,
  isCollapseScrollRestoreActive,
  isInitialLoading,
  isInvertedScroll,
  isLoadingMore: _isLoadingMore,
  onLoadMore,
  refreshEpoch,
  searchTerm,
}: UseFeedListSurfaceStateOptions) {
  const [hasClaimedInvertedScrollOwnership, setHasClaimedInvertedScrollOwnership] =
    useState(false);
  const hasUserScrolledRef = useRef(false);

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

  /** Marks the inverted viewport as reader-owned after a direct interaction. */
  const claimInvertedScrollOwnership = useCallback(() => {
    hasUserScrolledRef.current = true;
    setHasClaimedInvertedScrollOwnership(true);
  }, []);

  /** Resets the transient ownership state after a feed or filter change. */
  const resetInvertedScrollOwnership = useCallback(() => {
    setHasClaimedInvertedScrollOwnership(false);
  }, []);

  /** Underfilled inverted feeds must remain bottom-pinned to avoid dead space. */
  const shouldAnchorUnderfilledInvertedViewport = useCallback(() => {
    if (!scrollViewport) {
      return false;
    }

    const scrollableOverflowPx =
      scrollViewport.scrollHeight - scrollViewport.clientHeight;

    return (
      Number.isFinite(scrollableOverflowPx) &&
      scrollableOverflowPx <= FEED_MIN_SCROLLABLE_OVERFLOW_PX
    );
  }, [scrollViewport]);

  const {
    hasActiveInvertedExpansionScrollLock,
    releaseInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
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
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    shouldUseVirtualizedFeed,
    visibleArticleCount,
  } = useFeedPagination({
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer,
    clearInitialNormalScrollLock,
    feedViewKey,
    filteredFeedLength,
    hasActiveInvertedExpansionScrollLock,
    hasUserScrolledRef,
    isInitialLoading,
    isInvertedScroll,
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

  const shouldAutoAnchor = useCallback(() => {
    return shouldAutoAnchorInvertedScrollViewport({
      expandedArticleKey,
      hasClaimedInvertedScrollOwnership,
      isInvertedScroll,
      isUnderfilledInvertedViewport:
        shouldAnchorUnderfilledInvertedViewport(),
    });
  }, [
    expandedArticleKey,
    hasClaimedInvertedScrollOwnership,
    isInvertedScroll,
    shouldAnchorUnderfilledInvertedViewport,
  ]);

  /** Keeps inverted mode anchored to the newest row until the reader takes over. */
  const getInvertedScrollIntoViewLocation = useCallback(
    ({ totalCount }: { scrollingInProgress: boolean; totalCount: number }) => {
      if (!shouldAutoAnchor() || totalCount === 0) {
        return false;
      }

      return {
        align: "end" as const,
        behavior: "auto" as const,
        index: invertedScrollAnchorIndex,
      };
    },
    [invertedScrollAnchorIndex, shouldAutoAnchor],
  );

  /** Continues following the newest row while the inverted viewport is idle-owned. */
  const getInvertedFollowOutput = useCallback(() => {
    if (!shouldAutoAnchor()) {
      return false;
    }

    return "auto" as const;
  }, [shouldAutoAnchor]);

  const {
    contentKey,
    feedSurfaceMode,
    hasSearchTerm,
    shouldShowViewportResolutionSkeleton,
    trimmedSearchTerm,
  } = buildFeedSurfacePresentationState({
    filteredFeedLength,
    isInitialLoading,
    searchTerm,
    shouldUseVirtualizedFeed,
    viewportResolutionState,
  });

  const hasMoreArticles = visibleArticleCount < filteredFeedLength;
  const canLoadMoreBoundaryFromServer = Boolean(canLoadMoreFromServer);

  const virtuosoComponents = useMemo(
    () => ({
      Footer: () =>
        renderLoadMoreBoundary({
          canLoadMoreFromServer: canLoadMoreBoundaryFromServer,
          hasMoreArticles,
          loadMoreSentinelRef,
        }),
      Item: VirtuosoFeedItem,
    }),
    [canLoadMoreBoundaryFromServer, hasMoreArticles, loadMoreSentinelRef],
  );

  /** Inverted mode paginates upward, so it renders the load sentinel in the header. */
  const invertedVirtuosoComponents = useMemo(
    () => ({
      Header: () =>
        renderLoadMoreBoundary({
          canLoadMoreFromServer: canLoadMoreBoundaryFromServer,
          hasMoreArticles,
          loadMoreSentinelRef,
        }),
      Item: VirtuosoFeedItem,
      List: forwardRef<HTMLDivElement, ComponentPropsWithRef<"div">>(
        function InvertedVirtuosoList(props, ref) {
          return (
            <div
              {...props}
              ref={ref}
              style={{
                ...props.style,
                paddingBottom: 0,
              }}
            />
          );
        },
      ),
    }),
    [canLoadMoreBoundaryFromServer, hasMoreArticles, loadMoreSentinelRef],
  );

  return {
    contentKey,
    feedSurfaceMode,
    getInvertedFollowOutput,
    getInvertedScrollIntoViewLocation,
    handleViewportHostRef,
    hasMoreArticles,
    hasSearchTerm,
    invertedVirtuosoComponents,
    isInvertedScroll,
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    scrollViewport,
    shouldAutoAnchorInvertedScroll: shouldAutoAnchor,
    shouldLockInitialNormalScroll,
    shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed,
    syncInvertedExpansionScrollLock,
    trimmedSearchTerm,
    virtuosoComponents,
    visibleArticleCount,
  };
}

/**
 * Renders the invisible IntersectionObserver sentinel that fires load-more
 * pagination at the correct virtual position within the Virtuoso list.
 *
 * Skeleton rows are intentionally NOT rendered here.  They live outside the
 * Virtuoso component tree in FeedList so they appear and disappear via normal
 * React reconciliation, independent of Virtuoso's internal render cycle.
 * Keeping skeletons inside Virtuoso's Footer/Header caused them to be silently
 * swallowed when the closure-captured component reference changed on every
 * `isLoadingMore` flip, triggering a full unmount/remount of the Footer that
 * Virtuoso may defer based on its own scheduling.
 */
function renderLoadMoreBoundary({
  canLoadMoreFromServer,
  hasMoreArticles,
  loadMoreSentinelRef,
}: RenderLoadMoreBoundaryOptions) {
  if (!hasMoreArticles && !canLoadMoreFromServer) {
    return null;
  }

  return (
    <div
      className="h-px w-full"
      data-feed-load-more-sentinel="true"
      ref={loadMoreSentinelRef}
    />
  );
}