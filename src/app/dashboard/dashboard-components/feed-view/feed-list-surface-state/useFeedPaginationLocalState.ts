import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useFeedPaginationLocalState(options: {
  articlesPerPage: number;
  filteredFeedLength: number;
  hasCollapsingArticles: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  refreshEpoch: number;
}) {
  const boundaryRefs = useFeedPaginationBoundaryRefs();
  const historyRefs = useFeedPaginationHistoryRefs(options);
  const previousRefreshEpochForRenderRef = useRef(options.refreshEpoch);
  const [visibleArticleCount, setVisibleArticleCount] = useState(
    options.articlesPerPage,
  );

  const revealState = useCachedPageRevealState(
    historyRefs.isMountedRef,
    historyRefs.visibleArticleCountRef,
    setVisibleArticleCount,
  );

  const loadMoreSentinelRef = useCallback((node: HTMLDivElement | null) => {
    void node;
  }, []);
  const commitVisibleArticleCount = useCallback(
    (nextVisibleCount: number) => {
      historyRefs.visibleArticleCountRef.current = nextVisibleCount;

      if (historyRefs.isMountedRef.current) {
        setVisibleArticleCount(nextVisibleCount);
      }
    },
    [historyRefs.isMountedRef, historyRefs.visibleArticleCountRef],
  );

  const shouldClampVisibleArticleCountForRefresh =
    options.isRefreshing &&
    previousRefreshEpochForRenderRef.current !== options.refreshEpoch;
  const effectiveVisibleArticleCount = shouldClampVisibleArticleCountForRefresh
    ? Math.min(visibleArticleCount, options.articlesPerPage)
    : visibleArticleCount;

  if (shouldClampVisibleArticleCountForRefresh) {
    historyRefs.visibleArticleCountRef.current = effectiveVisibleArticleCount;
  }

  useLayoutEffect(() => {
    previousRefreshEpochForRenderRef.current = options.refreshEpoch;
  }, [options.refreshEpoch]);

  return {
    cancelCachedPageReveal: revealState.cancelCachedPageReveal,
    commitVisibleArticleCount,
    isCachedPageRevealing: revealState.isCachedPageRevealing,
    scheduleCachedPageReveal: revealState.scheduleCachedPageReveal,
    ...boundaryRefs,
    ...historyRefs,
    loadMoreSentinelRef,
    visibleArticleCount: effectiveVisibleArticleCount,
  };
}

function cancelPendingCachedRevealFrame(pendingCachedRevealFrameRef: {
  current: null | number;
}) {
  if (pendingCachedRevealFrameRef.current === null) {
    return;
  }

  window.cancelAnimationFrame(pendingCachedRevealFrameRef.current);
  pendingCachedRevealFrameRef.current = null;
}

/**
 * Manages the skeleton-reveal state for cached pagination transitions.
 * Skeleton rows show for at least one full paint cycle before new articles
 * replace them, even when the next page is already in the React Query cache.
 */
function useCachedPageRevealState(
  isMountedRef: { current: boolean },
  visibleArticleCountRef: { current: number },
  setVisibleArticleCount: (n: number) => void,
) {
  const [isCachedPageRevealing, setIsCachedPageRevealing] = useState(false);
  const pendingCachedRevealCountRef = useRef<null | number>(null);
  const pendingCachedRevealFrameRef = useRef<null | number>(null);

  /**
   * Cancels any in-flight cached-page reveal. Called by resetPaginationState
   * so a pending skeleton phase never commits a stale article count after a
   * filter change, refresh, or selection change.
   */
  const cancelCachedPageReveal = useCallback(() => {
    pendingCachedRevealCountRef.current = null;
    cancelPendingCachedRevealFrame(pendingCachedRevealFrameRef);
    if (isMountedRef.current) {
      setIsCachedPageRevealing(false);
    }
  }, [isMountedRef]);

  /**
   * Shows skeleton rows for the next page, then commits the new visible count
   * after the skeleton has had at least one paint cycle.  The rAF is queued
   * immediately so that rapid successive calls correctly supersede each other
   * without needing isCachedPageRevealing to toggle to re-trigger an effect.
   * React's batched-update pipeline commits the skeleton before the rAF fires.
   */
  const scheduleCachedPageReveal = useCallback(
    (nextCount: number) => {
      cancelPendingCachedRevealFrame(pendingCachedRevealFrameRef);
      pendingCachedRevealCountRef.current = nextCount;

      if (!isMountedRef.current) {
        return;
      }

      setIsCachedPageRevealing(true);

      pendingCachedRevealFrameRef.current = window.requestAnimationFrame(() => {
        pendingCachedRevealFrameRef.current = window.requestAnimationFrame(
          () => {
            pendingCachedRevealFrameRef.current = null;
            if (
              !isMountedRef.current ||
              pendingCachedRevealCountRef.current !== nextCount
            ) {
              return;
            }
            pendingCachedRevealCountRef.current = null;
            visibleArticleCountRef.current = nextCount;
            setVisibleArticleCount(nextCount);
            setIsCachedPageRevealing(false);
          },
        );
      });
    },
    [isMountedRef, visibleArticleCountRef, setVisibleArticleCount],
  );

  // Safety-net: if isCachedPageRevealing was externally cleared (via
  // cancelCachedPageReveal or reset) also cancel any still-pending rAF.
  useLayoutEffect(() => {
    if (isCachedPageRevealing) {
      return undefined;
    }
    cancelPendingCachedRevealFrame(pendingCachedRevealFrameRef);
    return undefined;
  }, [isCachedPageRevealing]);

  return {
    cancelCachedPageReveal,
    isCachedPageRevealing,
    scheduleCachedPageReveal,
  };
}

function useFeedPaginationBoundaryRefs() {
  const isInvertedLoadBoundaryArmedRef = useRef(true);
  const isStandardLoadBoundaryArmedRef = useRef(true);
  const paginationFrameRef = useRef<null | number>(null);
  const normalScrollIntentSuppressionFrameRef = useRef<null | number>(null);
  const lastStandardScrollTopRef = useRef<null | number>(null);
  const lastAutoFillListHeightRef = useRef<null | number>(null);

  return {
    isInvertedLoadBoundaryArmedRef,
    isStandardLoadBoundaryArmedRef,
    lastAutoFillListHeightRef,
    lastStandardScrollTopRef,
    normalScrollIntentSuppressionFrameRef,
    paginationFrameRef,
  };
}

function useFeedPaginationHistoryRefs(options: {
  articlesPerPage: number;
  filteredFeedLength: number;
  hasCollapsingArticles: boolean;
  isLoadingMore: boolean;
  refreshEpoch: number;
}) {
  const hasCollapsingArticlesRef = useRef(options.hasCollapsingArticles);
  const isMountedRef = useRef(true);
  const filteredFeedLengthRef = useRef(options.filteredFeedLength);
  const previousFilteredFeedLengthRef = useRef(options.filteredFeedLength);
  const previousIsLoadingMoreRef = useRef(options.isLoadingMore);
  const previousRefreshEpochRef = useRef(options.refreshEpoch);
  const visibleArticleCountRef = useRef(options.articlesPerPage);

  return {
    filteredFeedLengthRef,
    hasCollapsingArticlesRef,
    isMountedRef,
    previousFilteredFeedLengthRef,
    previousIsLoadingMoreRef,
    previousRefreshEpochRef,
    visibleArticleCountRef,
  };
}
