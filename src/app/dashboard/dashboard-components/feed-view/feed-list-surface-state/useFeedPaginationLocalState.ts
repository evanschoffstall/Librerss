import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { SKELETON_MIN_VISIBLE_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

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

/** Cancels both the rAF and the hold timeout for a pending cached reveal. */
function cancelPendingCachedReveal(
  pendingCachedRevealFrameRef: { current: null | number },
  pendingCachedRevealTimeoutRef: {
    current: null | ReturnType<typeof setTimeout>;
  },
) {
  cancelPendingCachedRevealFrame(pendingCachedRevealFrameRef);

  if (pendingCachedRevealTimeoutRef.current !== null) {
    clearTimeout(pendingCachedRevealTimeoutRef.current);
    pendingCachedRevealTimeoutRef.current = null;
  }
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

function useCachedPageRevealState(
  isMountedRef: { current: boolean },
  visibleArticleCountRef: { current: number },
  setVisibleArticleCount: (n: number) => void,
) {
  const [isCachedPageRevealing, setIsCachedPageRevealing] = useState(false);
  const pendingCachedRevealCountRef = useRef<null | number>(null);
  const pendingCachedRevealFrameRef = useRef<null | number>(null);
  const pendingCachedRevealTimeoutRef = useRef<null | ReturnType<
    typeof setTimeout
  >>(null);

  const cancelCachedPageReveal = useCallback(() => {
    pendingCachedRevealCountRef.current = null;
    cancelPendingCachedReveal(
      pendingCachedRevealFrameRef,
      pendingCachedRevealTimeoutRef,
    );
    if (isMountedRef.current) {
      setIsCachedPageRevealing(false);
    }
  }, [isMountedRef]);

  const scheduleCachedPageReveal = useCallback(
    (nextCount: number) => {
      console.log("[skeleton-debug] scheduleCachedPageReveal called", { nextCount });
      cancelPendingCachedReveal(
        pendingCachedRevealFrameRef,
        pendingCachedRevealTimeoutRef,
      );
      pendingCachedRevealCountRef.current = nextCount;

      if (!isMountedRef.current) {
        return;
      }

      setIsCachedPageRevealing(true);

      pendingCachedRevealFrameRef.current = window.requestAnimationFrame(() => {
        pendingCachedRevealFrameRef.current = null;

        pendingCachedRevealTimeoutRef.current = setTimeout(() => {
          pendingCachedRevealTimeoutRef.current = null;

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
        }, SKELETON_MIN_VISIBLE_MS);
      });
    },
    [isMountedRef, visibleArticleCountRef, setVisibleArticleCount],
  );

  useLayoutEffect(() => {
    if (isCachedPageRevealing) {
      return undefined;
    }
    cancelPendingCachedReveal(
      pendingCachedRevealFrameRef,
      pendingCachedRevealTimeoutRef,
    );
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
