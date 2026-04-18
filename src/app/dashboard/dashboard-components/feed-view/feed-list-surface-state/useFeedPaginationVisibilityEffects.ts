import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import {
  finalizePaginationBoundaryRearm,
  type PaginationBoundaryUserIntentOptions,
  shouldAbortPaginationBoundaryRearm,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";
import { resolvePaginationBoundaryState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationRules";

interface PendingServerRevealOptions {
  hasPendingServerRevealRef: { current: boolean };
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  lastInvertedAwayBoundarySnapshotRef: { current: unknown };
  lastInvertedScrollTopRef: { current: null | number };
  startServerLoadRearmCooldown: () => void;
}

/**
 * @param options
 * @param options.hasCollapsingArticles
 * @param options.hasCollapsingArticlesRef
 * @param options.hasCollapsingArticlesRef.current
 */
export function useCollapsingArticlesRefSync(options: {
  hasCollapsingArticles: boolean;
  hasCollapsingArticlesRef: { current: boolean };
}) {
  useLayoutEffect(() => {
    options.hasCollapsingArticlesRef.current = options.hasCollapsingArticles;
  }, [options.hasCollapsingArticles, options.hasCollapsingArticlesRef]);
}

/**
 * @param options
 */
export function useFeedPaginationLoadingMoreRevealEffect(
  options: PendingServerRevealOptions & {
    isLoadingMore: boolean;
    previousIsLoadingMoreRef: { current: boolean };
  },
) {
  const {
    hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    previousIsLoadingMoreRef,
    startServerLoadRearmCooldown,
  } = options;
  useLayoutEffect(() => {
    const previousIsLoadingMore = previousIsLoadingMoreRef.current;
    previousIsLoadingMoreRef.current = isLoadingMore;

    if (
      isLoadingMore ||
      !previousIsLoadingMore ||
      !hasPendingServerRevealRef.current
    ) {
      return;
    }

    completePendingServerReveal({
      hasPendingServerRevealRef,
      hasResolvedStandardViewportRevealRef,
      isInvertedScroll,
      isStandardViewportRefillActiveRef,
      lastInvertedAwayBoundarySnapshotRef,
      lastInvertedScrollTopRef,
      startServerLoadRearmCooldown,
    });
  }, [
    hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    isStandardViewportRefillActiveRef,
    previousIsLoadingMoreRef,
    startServerLoadRearmCooldown,
  ]);
}

/**
 * @param options
 * @param options.articleFilter
 * @param options.feedViewKey
 * @param options.isInvertedScroll
 * @param options.resetPaginationState
 * @param options.searchTerm
 */
export function useFeedPaginationQueryResetEffect(options: {
  articleFilter: string;
  feedViewKey: string;
  isInvertedScroll: boolean;
  resetPaginationState: () => void;
  searchTerm: string;
}) {
  const {
    articleFilter,
    feedViewKey,
    isInvertedScroll,
    resetPaginationState,
    searchTerm,
  } = options;
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    resetPaginationState();
  }, [
    articleFilter,
    feedViewKey,
    isInvertedScroll,
    resetPaginationState,
    searchTerm,
  ]);
}

/**
 * @param options
 * @param options.hasUserScrolledRef
 * @param options.hasUserScrolledRef.current
 * @param options.isInvertedScroll
 * @param options.isLoadingMore
 * @param options.isRefreshing
 * @param options.isStandardViewportRefillActiveRef
 * @param options.isStandardViewportRefillActiveRef.current
 * @param options.previousRefreshEpochRef
 * @param options.previousRefreshEpochRef.current
 * @param options.refreshEpoch
 * @param options.resetPaginationState
 */
export function useFeedPaginationRefreshResetEffect(options: {
  hasUserScrolledRef: { current: boolean };
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  previousRefreshEpochRef: { current: number };
  refreshEpoch: number;
  resetPaginationState: () => void;
}) {
  const {
    hasUserScrolledRef,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    isStandardViewportRefillActiveRef,
    previousRefreshEpochRef,
    refreshEpoch,
    resetPaginationState,
  } = options;
  useLayoutEffect(() => {
    const didRefreshEpochChange =
      previousRefreshEpochRef.current !== refreshEpoch;
    previousRefreshEpochRef.current = refreshEpoch;
    const shouldResetForActiveRefresh =
      didRefreshEpochChange && isRefreshing && !isLoadingMore;

    if (shouldResetForActiveRefresh) {
      if (!isInvertedScroll) {
        isStandardViewportRefillActiveRef.current = false;
      }
      resetPaginationState();
    }
  }, [
    hasUserScrolledRef,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    isStandardViewportRefillActiveRef,
    previousRefreshEpochRef,
    refreshEpoch,
    resetPaginationState,
  ]);
}

/**
 * @param options
 */
export function useFeedPaginationRevealCountEffect(
  options: PendingServerRevealOptions & {
    commitVisibleArticleCount: (nextVisibleCount: number) => void;
    filteredFeedLength: number;
    hasRequestedServerLoadRef: { current: boolean };
    isLoadingMore: boolean;
    previousFilteredFeedLengthRef: { current: number };
    visibleArticleCountRef: { current: number };
  },
) {
  const {
    commitVisibleArticleCount,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    previousFilteredFeedLengthRef,
    startServerLoadRearmCooldown,
    visibleArticleCountRef,
  } = options;
  useLayoutEffect(() => {
    const currentVisibleCount = visibleArticleCountRef.current;

    if (isLoadingMore && currentVisibleCount < filteredFeedLength) {
      commitVisibleArticleCount(filteredFeedLength);
      previousFilteredFeedLengthRef.current = filteredFeedLength;
      return;
    }

    const previousFilteredFeedLength = previousFilteredFeedLengthRef.current;
    previousFilteredFeedLengthRef.current = filteredFeedLength;
    const hasSettledRequestedReveal =
      hasPendingServerRevealRef.current || hasRequestedServerLoadRef.current;

    if (
      !hasSettledRequestedReveal ||
      filteredFeedLength <= previousFilteredFeedLength
    ) {
      return;
    }

    completePendingServerReveal({
      hasPendingServerRevealRef,
      hasResolvedStandardViewportRevealRef,
      isInvertedScroll,
      isStandardViewportRefillActiveRef,
      lastInvertedAwayBoundarySnapshotRef,
      lastInvertedScrollTopRef,
      startServerLoadRearmCooldown,
    });

    if (currentVisibleCount < filteredFeedLength) {
      commitVisibleArticleCount(filteredFeedLength);
    }
  }, [
    commitVisibleArticleCount,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    isStandardViewportRefillActiveRef,
    previousFilteredFeedLengthRef,
    startServerLoadRearmCooldown,
    visibleArticleCountRef,
  ]);
}

/**
 * @param options
 * @param options.filteredFeedLength
 * @param options.isInitialLoading
 * @param options.maybeAutoFillViewport
 * @param options.scrollViewport
 * @param options.shouldUseVirtualizedFeed
 * @param options.visibleArticleCount
 */
export function useInitialFeedPaginationAutoFillEffect(options: {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
  scrollViewport: HTMLElement | null;
  shouldUseVirtualizedFeed: boolean;
  visibleArticleCount: number;
}) {
  const {
    filteredFeedLength,
    isInitialLoading,
    maybeAutoFillViewport,
    scrollViewport,
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
    visibleArticleCount,
  ]);
}

/**
 * @param options
 * @param options.isMountedRef
 * @param options.isMountedRef.current
 */
export function useMountedFlagCleanupEffect(options: {
  isMountedRef: { current: boolean };
}) {
  useEffect(() => {
    return () => {
      options.isMountedRef.current = false;
    };
  }, [options.isMountedRef]);
}

/**
 * @param options
 */
export function useRearmPaginationBoundaryFromUserIntent(
  options: PaginationBoundaryUserIntentOptions,
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
      armedBoundaryRef: isInvertedScroll
        ? isInvertedLoadBoundaryArmedRef
        : isStandardLoadBoundaryArmedRef,
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
    scrollViewport,
  ]);
}

/**
 * @param options
 * @param options.filteredFeedLength
 * @param options.hasResolvedStandardViewportRevealRef
 * @param options.hasResolvedStandardViewportRevealRef.current
 * @param options.isInvertedScroll
 * @param options.maybeAutoFillViewport
 */
export function useResolvedStandardViewportRevealEffect(options: {
  filteredFeedLength: number;
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
}) {
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
    maybeAutoFillViewport();
  }, [
    filteredFeedLength,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    maybeAutoFillViewport,
  ]);
}

/**
 * @param options
 * @param options.visibleArticleCount
 * @param options.visibleArticleCountRef
 * @param options.visibleArticleCountRef.current
 */
export function useVisibleArticleCountRefSync(options: {
  visibleArticleCount: number;
  visibleArticleCountRef: { current: number };
}) {
  useLayoutEffect(() => {
    options.visibleArticleCountRef.current = options.visibleArticleCount;
  }, [options.visibleArticleCount, options.visibleArticleCountRef]);
}

/**
 * @param options
 */
function completePendingServerReveal(options: PendingServerRevealOptions) {
  options.hasPendingServerRevealRef.current = false;
  if (options.isInvertedScroll) {
    options.lastInvertedAwayBoundarySnapshotRef.current = null;
    options.lastInvertedScrollTopRef.current = null;
  }
  options.startServerLoadRearmCooldown();

  if (
    !options.isInvertedScroll &&
    options.isStandardViewportRefillActiveRef.current
  ) {
    options.hasResolvedStandardViewportRevealRef.current = true;
  }
}
