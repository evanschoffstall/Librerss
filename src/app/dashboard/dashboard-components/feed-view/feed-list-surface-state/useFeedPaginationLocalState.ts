import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { SKELETON_MIN_VISIBLE_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

interface CachedPageRevealStateIsMountedRef {
  current: boolean;
}

interface CachedPageRevealStateVisibleArticleCountRef {
  current: number;
}

interface CancelPendingCachedRevealFramePendingCachedRevealFrameRef {
  current: null | number;
}

interface CancelPendingCachedRevealPendingCachedRevealFrameRef {
  current: null | number;
}

interface CancelPendingCachedRevealPendingCachedRevealTimeoutRef {
  current: null | ReturnType<typeof setTimeout>;
}

interface FeedPaginationHistoryRefsOptions {
  articlesPerPage: number;
  filteredFeedLength: number;
  hasCollapsingArticles: boolean;
  isLoadingMore: boolean;
  refreshEpoch: number;
}
interface FeedPaginationLocalStateOptions {
  articlesPerPage: number;
  filteredFeedLength: number;
  hasCollapsingArticles: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  refreshEpoch: number;
}

interface PendingCachedRevealCountRef {
  current: null | number;
}
/**
 * Manage the feed pagination local state.
 * @param options - The options used to manage the feed pagination local state.
 * @returns The feed pagination local state state and callbacks.
 */
export function useFeedPaginationLocalState(
  options: FeedPaginationLocalStateOptions,
) {
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

/**
 * Process the cancel pending cached reveal.
 * @param pendingCachedRevealFrameRef - The ref that stores the pending cached reveal frame ref.
 * @param pendingCachedRevealTimeoutRef - The ref that stores the pending cached reveal timeout ref.
 */
function cancelPendingCachedReveal(
  pendingCachedRevealFrameRef: CancelPendingCachedRevealPendingCachedRevealFrameRef,
  pendingCachedRevealTimeoutRef: CancelPendingCachedRevealPendingCachedRevealTimeoutRef,
) {
  cancelPendingCachedRevealFrame(pendingCachedRevealFrameRef);

  if (pendingCachedRevealTimeoutRef.current !== null) {
    clearTimeout(pendingCachedRevealTimeoutRef.current);
    pendingCachedRevealTimeoutRef.current = null;
  }
}

/**
 * Process the cancel pending cached reveal frame.
 * @param pendingCachedRevealFrameRef - The ref that stores the pending cached reveal frame ref.
 */
function cancelPendingCachedRevealFrame(
  pendingCachedRevealFrameRef: CancelPendingCachedRevealFramePendingCachedRevealFrameRef,
) {
  if (pendingCachedRevealFrameRef.current === null) {
    return;
  }

  window.cancelAnimationFrame(pendingCachedRevealFrameRef.current);
  pendingCachedRevealFrameRef.current = null;
}

/**
 * Finalize a cached-page reveal after its skeleton hold completes.
 * @param isMountedRef - Tracks whether the owning hook is still mounted.
 * @param nextCount - The next visible article count to commit.
 * @param pendingCachedRevealCountRef - Stores the currently scheduled reveal count.
 * @param setIsCachedPageRevealing - Updates the cached-reveal visibility flag.
 * @param setVisibleArticleCount - Commits the visible article count into React state.
 * @param visibleArticleCountRef - Stores the visible article count outside render.
 */
function finalizeCachedPageReveal(
  isMountedRef: CachedPageRevealStateIsMountedRef,
  nextCount: number,
  pendingCachedRevealCountRef: PendingCachedRevealCountRef,
  setIsCachedPageRevealing: (value: boolean) => void,
  setVisibleArticleCount: (n: number) => void,
  visibleArticleCountRef: CachedPageRevealStateVisibleArticleCountRef,
) {
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
}

/**
 * Manage the cached page reveal state.
 * @param isMountedRef - The ref that stores the is mounted ref.
 * @param visibleArticleCountRef - The ref that stores the visible article count ref.
 * @param setVisibleArticleCount - The callback that set visible article count.
 * @returns The cached page reveal state state and callbacks.
 */
function useCachedPageRevealState(
  isMountedRef: CachedPageRevealStateIsMountedRef,
  visibleArticleCountRef: CachedPageRevealStateVisibleArticleCountRef,
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
      if (pendingCachedRevealCountRef.current === nextCount) {
        return;
      }

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
          finalizeCachedPageReveal(
            isMountedRef,
            nextCount,
            pendingCachedRevealCountRef,
            setIsCachedPageRevealing,
            setVisibleArticleCount,
            visibleArticleCountRef,
          );
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
/**
 * Manage the feed pagination boundary refs.
 * @returns The feed pagination boundary refs state and callbacks.
 */
function useFeedPaginationBoundaryRefs() {
  const isInvertedLoadBoundaryArmedRef = useRef(true);
  const isStandardLoadBoundaryArmedRef = useRef(true);
  const paginationFrameRef = useRef<null | number>(null);
  const normalScrollIntentSuppressionFrameRef = useRef<null | number>(null);
  const lastStandardScrollTopRef = useRef<null | number>(null);
  const lastAutoFillListHeightRef = useRef<null | number>(null);
  const suppressNextInitialViewportAutoFillRef = useRef(false);
  const suppressNextRefreshViewportRefillRef = useRef(false);
  const standardViewportRefillTargetVisibleCountRef = useRef<null | number>(
    null,
  );

  return {
    isInvertedLoadBoundaryArmedRef,
    isStandardLoadBoundaryArmedRef,
    lastAutoFillListHeightRef,
    lastStandardScrollTopRef,
    normalScrollIntentSuppressionFrameRef,
    paginationFrameRef,
    standardViewportRefillTargetVisibleCountRef,
    suppressNextInitialViewportAutoFillRef,
    suppressNextRefreshViewportRefillRef,
  };
}

/**
 * Manage the feed pagination history refs.
 * @param options - The options used to manage the feed pagination history refs.
 * @returns The feed pagination history refs state and callbacks.
 */
function useFeedPaginationHistoryRefs(
  options: FeedPaginationHistoryRefsOptions,
) {
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
