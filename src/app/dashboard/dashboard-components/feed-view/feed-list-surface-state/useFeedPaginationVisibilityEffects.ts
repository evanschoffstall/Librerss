import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import type {
  CollapsingArticlesRefSyncOptions,
  FeedPaginationLoadingMoreRevealEffectOptions,
  FeedPaginationQueryResetEffectOptions,
  FeedPaginationRefreshResetEffectOptions,
  FeedPaginationRevealCountEffectOptions,
  InitialFeedPaginationAutoFillEffectOptions,
  MountedFlagCleanupEffectOptions,
  NullableNumberRef,
  RearmPaginationBoundaryFromUserIntentOptions,
  ResolvedStandardViewportRevealEffectOptions,
  TimeoutHandleRef,
  VisibleArticleCountRefSyncOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedPaginationVisibilityEffectsTypes";

import {
  finalizePaginationBoundaryRearm,
  shouldAbortPaginationBoundaryRearm,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";
import {
  maybeAdvanceInvertedScrollTopHistory,
  resolvePaginationBoundaryState,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationRules";
import {
  cancelPendingServerRevealCompletion,
  completePendingServerReveal,
  handleFeedPaginationRevealCountTransition,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/pendingServerReveal";

export { useFeedPaginationStaleResumeResetEffect } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationStaleResumeResetEffect";

/**
 * Manage the collapsing articles ref sync.
 * @param options - The options used to manage the collapsing articles ref sync.
 */
export function useCollapsingArticlesRefSync(
  options: CollapsingArticlesRefSyncOptions,
) {
  useLayoutEffect(() => {
    options.hasCollapsingArticlesRef.current = options.hasCollapsingArticles;
  }, [options.hasCollapsingArticles, options.hasCollapsingArticlesRef]);
}

/**
 * Keep server-pagination skeletons mounted until the loaded article window can replace them.
 *
 * The server-load flag can clear before React has rendered the larger filtered
 * feed. While the visible count is still catching up, both standard and
 * inverted scroll keep the pending reveal alive so skeletons do not disappear
 * before the incoming rows are committed. Once the visible window has caught up,
 * this effect only performs terminal cleanup when the server reports no more
 * pages; ordinary page reveals are released by the count-transition scheduler.
 * @param options - The refs, counts, and callbacks that own the pending server reveal.
 */
export function useFeedPaginationLoadingMoreRevealEffect(
  options: FeedPaginationLoadingMoreRevealEffectOptions,
) {
  const {
    canLoadMoreFromServer,
    filteredFeedLength,
    hasCompletedInvertedServerRevealRef,
    hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    previousIsLoadingMoreRef,
    setIsPendingServerRevealVisible,
    startServerLoadRearmCooldown,
    visibleArticleCount,
  } = options;
  useLayoutEffect(() => {
    previousIsLoadingMoreRef.current = isLoadingMore;

    if (isLoadingMore || !hasPendingServerRevealRef.current) {
      return;
    }

    if (filteredFeedLength > visibleArticleCount) {
      return;
    }

    if (canLoadMoreFromServer) {
      return;
    }

    completePendingServerReveal({
      hasCompletedInvertedServerRevealRef,
      hasPendingServerRevealRef,
      hasResolvedStandardViewportRevealRef,
      isInvertedScroll,
      isStandardViewportRefillActiveRef,
      lastInvertedAwayBoundarySnapshotRef,
      lastInvertedScrollTopRef,
      setIsPendingServerRevealVisible,
      startServerLoadRearmCooldown,
    });
  }, [
    canLoadMoreFromServer,
    filteredFeedLength,
    hasCompletedInvertedServerRevealRef,
    hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    setIsPendingServerRevealVisible,
    isLoadingMore,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    isStandardViewportRefillActiveRef,
    previousIsLoadingMoreRef,
    startServerLoadRearmCooldown,
    visibleArticleCount,
  ]);
}

/**
 * Manage the feed pagination query reset effect.
 * @param options - The options used to manage the feed pagination query reset effect.
 */
export function useFeedPaginationQueryResetEffect(
  options: FeedPaginationQueryResetEffectOptions,
) {
  const {
    articleFilter,
    articlesPerPage,
    feedViewKey,
    isInvertedScroll,
    resetPaginationState,
    searchTerm,
    suppressNextInitialViewportAutoFillRef,
    suppressNextRefreshViewportRefillRef,
  } = options;
  const hasMountedRef = useRef(false);

  useLayoutEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    suppressNextInitialViewportAutoFillRef.current = true;
    suppressNextRefreshViewportRefillRef.current = true;
    resetPaginationState();
  }, [
    articlesPerPage,
    articleFilter,
    feedViewKey,
    isInvertedScroll,
    resetPaginationState,
    searchTerm,
    suppressNextInitialViewportAutoFillRef,
    suppressNextRefreshViewportRefillRef,
  ]);
}

/**
 * Manage the feed pagination refresh reset effect.
 * @param options - The options used to manage the feed pagination refresh reset effect.
 */
export function useFeedPaginationRefreshResetEffect(
  options: FeedPaginationRefreshResetEffectOptions,
) {
  const {
    articleFilter,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    isStandardViewportRefillActiveRef,
    previousRefreshEpochRef,
    refreshEpoch,
    resetPaginationState,
    standardViewportRefillTargetVisibleCountRef,
    suppressNextRefreshViewportRefillRef,
  } = options;
  useLayoutEffect(() => {
    const didRefreshEpochChange =
      previousRefreshEpochRef.current !== refreshEpoch;
    previousRefreshEpochRef.current = refreshEpoch;
    const shouldResetForActiveRefresh =
      didRefreshEpochChange && isRefreshing && !isLoadingMore;

    if (shouldResetForActiveRefresh) {
      const shouldSuppressRefreshViewportRefill =
        suppressNextRefreshViewportRefillRef.current;
      suppressNextRefreshViewportRefillRef.current = false;

      if (!isInvertedScroll) {
        isStandardViewportRefillActiveRef.current = false;
      }
      resetPaginationState();

      if (shouldSuppressRefreshViewportRefill) {
        return;
      }

      if (!isInvertedScroll && articleFilter === "unread") {
        isStandardViewportRefillActiveRef.current = false;
        standardViewportRefillTargetVisibleCountRef.current = null;
      }
    }
  }, [
    articleFilter,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    isStandardViewportRefillActiveRef,
    previousRefreshEpochRef,
    refreshEpoch,
    resetPaginationState,
    standardViewportRefillTargetVisibleCountRef,
    suppressNextRefreshViewportRefillRef,
  ]);
}

/**
 * Manage the feed pagination reveal count effect.
 * @param options - The options used to manage the feed pagination reveal count effect.
 */
export function useFeedPaginationRevealCountEffect(
  options: FeedPaginationRevealCountEffectOptions,
) {
  const {
    commitVisibleArticleCount,
    filteredFeedLength,
    hasCompletedInvertedServerRevealRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    previousFilteredFeedLengthRef,
    setIsPendingServerRevealVisible,
    startServerLoadRearmCooldown,
    visibleArticleCountRef,
  } = options;
  const pendingServerRevealCountRef = useRef<null | number>(null);
  const pendingServerRevealFrameRef = useRef<null | number>(null);
  const pendingServerRevealTimeoutRef = useRef<null | ReturnType<
    typeof setTimeout
  >>(null);
  usePendingServerRevealCleanup(
    pendingServerRevealCountRef,
    pendingServerRevealFrameRef,
    pendingServerRevealTimeoutRef,
  );

  useLayoutEffect(() => {
    handleFeedPaginationRevealCountTransition({
      commitVisibleArticleCount,
      filteredFeedLength,
      hasCompletedInvertedServerRevealRef,
      hasPendingServerRevealRef,
      hasRequestedServerLoadRef,
      hasResolvedStandardViewportRevealRef,
      isInvertedScroll,
      isLoadingMore,
      isStandardViewportRefillActiveRef,
      lastInvertedAwayBoundarySnapshotRef,
      lastInvertedScrollTopRef,
      pendingServerRevealCountRef,
      pendingServerRevealFrameRef,
      pendingServerRevealTimeoutRef,
      previousFilteredFeedLengthRef,
      setIsPendingServerRevealVisible,
      startServerLoadRearmCooldown,
      visibleArticleCountRef,
    });
  }, [
    commitVisibleArticleCount,
    filteredFeedLength,
    hasCompletedInvertedServerRevealRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    setIsPendingServerRevealVisible,
    isLoadingMore,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    isStandardViewportRefillActiveRef,
    pendingServerRevealCountRef,
    pendingServerRevealFrameRef,
    pendingServerRevealTimeoutRef,
    previousFilteredFeedLengthRef,
    startServerLoadRearmCooldown,
    visibleArticleCountRef,
  ]);
}

/**
 * Manage the initial feed pagination auto fill effect.
 * @param options - The options used to manage the initial feed pagination auto fill effect.
 */
export function useInitialFeedPaginationAutoFillEffect(
  options: InitialFeedPaginationAutoFillEffectOptions,
) {
  const {
    filteredFeedLength,
    isInitialLoading,
    maybeAutoFillViewport,
    scrollViewport,
    suppressNextInitialViewportAutoFillRef,
    visibleArticleCount,
  } = options;
  useEffect(() => {
    if (
      !scrollViewport ||
      isInitialLoading ||
      visibleArticleCount >= filteredFeedLength
    ) {
      return;
    }

    if (suppressNextInitialViewportAutoFillRef.current) {
      suppressNextInitialViewportAutoFillRef.current = false;
      return;
    }

    const autoFillFrameId = window.requestAnimationFrame(() => {
      maybeAutoFillViewport();
    });

    return () => {
      window.cancelAnimationFrame(autoFillFrameId);
    };
  }, [
    filteredFeedLength,
    isInitialLoading,
    maybeAutoFillViewport,
    scrollViewport,
    suppressNextInitialViewportAutoFillRef,
    visibleArticleCount,
  ]);
}

/**
 * Manage the mounted flag cleanup effect.
 * @param options - The options used to manage the mounted flag cleanup effect.
 */
export function useMountedFlagCleanupEffect(
  options: MountedFlagCleanupEffectOptions,
) {
  useEffect(() => {
    return () => {
      options.isMountedRef.current = false;
    };
  }, [options.isMountedRef]);
}

/**
 * Manage the rearm pagination boundary from user intent.
 * @param options - The options used to manage the rearm pagination boundary from user intent.
 * @returns The rearm pagination boundary from user intent state and callbacks.
 */
export function useRearmPaginationBoundaryFromUserIntent(
  options: RearmPaginationBoundaryFromUserIntentOptions,
) {
  const {
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    invertedPaginationAnchorRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    scrollViewport,
  } = options;
  return useCallback(() => {
    if (!scrollViewport) {
      return;
    }

    if (isInvertedScroll) {
      if (hasPendingServerRevealRef.current) {
        return;
      }

      // When the user's current scroll position is away from the top boundary,
      // record it so the scroll handler's position-history stays accurate and
      // maybeLoadInvertedNextPage can later distinguish a genuine
      // return-from-away gesture from a repeated pinned-at-boundary touch.
      maybeAdvanceInvertedScrollTopHistory(
        scrollViewport,
        options.lastInvertedScrollTopRef,
      );

      finalizePaginationBoundaryRearm({
        armedBoundaryRef: isInvertedLoadBoundaryArmedRef,
        hasPendingBoundaryRearmAfterCooldownRef,
        hasRequestedServerLoadRef,
      });
      return;
    }

    if (
      shouldAbortPaginationBoundaryRearm(
        scrollViewport,
        hasPendingServerRevealRef,
        invertedPaginationAnchorRef,
      )
    ) {
      return;
    }

    const { hasMovedAwayFromBoundary } = resolvePaginationBoundaryState({
      isInvertedScroll,
      scrollViewport,
    });

    if (!hasMovedAwayFromBoundary) {
      return;
    }

    finalizePaginationBoundaryRearm({
      armedBoundaryRef: isStandardLoadBoundaryArmedRef,
      hasPendingBoundaryRearmAfterCooldownRef,
      hasRequestedServerLoadRef,
    });
  }, [
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    invertedPaginationAnchorRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    options.lastInvertedScrollTopRef,
    scrollViewport,
  ]);
}

/**
 * Manage the resolved standard viewport reveal effect.
 * @param options - The options used to manage the resolved standard viewport reveal effect.
 */
export function useResolvedStandardViewportRevealEffect(
  options: ResolvedStandardViewportRevealEffectOptions,
) {
  const {
    filteredFeedLength,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    maybeAutoFillViewport,
  } = options;
  useLayoutEffect(() => {
    if (isInvertedScroll || !hasResolvedStandardViewportRevealRef.current) {
      return;
    }

    hasResolvedStandardViewportRevealRef.current = false;
    maybeAutoFillViewport(undefined, true);
  }, [
    filteredFeedLength,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    maybeAutoFillViewport,
  ]);
}
/**
 * Manage the visible article count ref sync.
 * @param options - The options used to manage the visible article count ref sync.
 */
export function useVisibleArticleCountRefSync(
  options: VisibleArticleCountRefSyncOptions,
) {
  useLayoutEffect(() => {
    options.visibleArticleCountRef.current = options.visibleArticleCount;
  }, [options.visibleArticleCount, options.visibleArticleCountRef]);
}

/**
 * Cancels deferred pending-reveal work when the owning hook unmounts.
 * @param pendingServerRevealCountRef - Tracks the pending reveal count.
 * @param pendingServerRevealFrameRef - Tracks the scheduled reveal frame.
 * @param pendingServerRevealTimeoutRef - Tracks the delayed reveal timeout.
 */
function usePendingServerRevealCleanup(
  pendingServerRevealCountRef: NullableNumberRef,
  pendingServerRevealFrameRef: NullableNumberRef,
  pendingServerRevealTimeoutRef: TimeoutHandleRef,
) {
  useEffect(() => {
    return () => {
      cancelPendingServerRevealCompletion(
        pendingServerRevealCountRef,
        pendingServerRevealFrameRef,
        pendingServerRevealTimeoutRef,
      );
    };
  }, [
    pendingServerRevealCountRef,
    pendingServerRevealFrameRef,
    pendingServerRevealTimeoutRef,
  ]);
}
