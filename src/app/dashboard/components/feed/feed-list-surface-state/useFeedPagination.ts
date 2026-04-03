import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
  FEED_LOAD_MORE_THRESHOLD_PX,
  FEED_SERVER_LOAD_REARM_COOLDOWN_MS,
} from "./constants";
import {
  findInvertedExpansionHeaderAnchor,
  findInvertedExpansionLockAnchor,
  findTopVisibleInvertedPaginationAnchorArticleKey,
  getViewportOffsetTop,
} from "./dom";
import {
  hasMovedAwayFromBoundarySincePreviousScroll,
  resolveNextVisibleCount,
  resolvePaginationBoundaryState,
  shouldAutoFillViewport,
} from "./paginationRules";

const MIN_UNREAD_REFILL_OVERFLOW_ARTICLES = 1;

interface InvertedPaginationAnchorState {
  anchorArticleKey: null | string;
  anchorViewportOffsetTop: number;
  initialScrollHeight: number;
  initialScrollTop: number;
  releaseAt: number;
}

interface PendingInvertedPaginationAnchorSnapshot {
  anchorArticleKey: null | string;
  anchorViewportOffsetTop: number;
  scrollHeight: number;
  scrollTop: number;
}

const INVERTED_PAGINATION_ANCHOR_SYNC_WINDOW_MS = 1_500;

const STANDARD_VIEWPORT_REFILL_SHRINK_THRESHOLD_PX = 1;


interface UseFeedPaginationOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer?: boolean;
  clearInitialNormalScrollLock: () => void;
  feedViewKey: string;
  filteredFeedLength: number;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasCollapsingArticles: boolean;
  hasUserScrolledRef: { current: boolean };
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  onClaimInvertedScrollOwnership: () => void;
  onLoadMore?: () => void;
  onReleaseInvertedExpansionScrollLock: () => void;
  onResetInvertedScrollOwnership: () => void;
  onSyncInvertedExpansionScrollLock: () => void;
  refreshEpoch: number;
  scrollViewport: HTMLElement | null;
  searchTerm: string;
  shouldLockInitialNormalScroll: () => boolean;
}

/**
 * Owns visible-window sizing, scroll-triggered pagination, and viewport auto-fill.
 *
 * This keeps feed paging mechanics separate from the higher-level viewport lock
 * and anchor logic so the main hook reads as orchestration instead of event soup.
 */
export function useFeedPagination({
  articleFilter,
  articlesPerPage,
  canLoadMoreFromServer = false,
  clearInitialNormalScrollLock,
  feedViewKey,
  filteredFeedLength,
  hasActiveInvertedExpansionScrollLock,
  hasCollapsingArticles,
  hasUserScrolledRef,
  isInitialLoading,
  isInvertedScroll,
  isLoadingMore,
  isRefreshing,
  onClaimInvertedScrollOwnership,
  onLoadMore,
  onReleaseInvertedExpansionScrollLock,
  onResetInvertedScrollOwnership,
  onSyncInvertedExpansionScrollLock,
  refreshEpoch,
  scrollViewport,
  searchTerm,
  shouldLockInitialNormalScroll,
}: UseFeedPaginationOptions) {
  const hasCollapsingArticlesRef = useRef(hasCollapsingArticles);

  // Must be useLayoutEffect — the virtualized height commit lands during the
  // layout phase before useEffect callbacks run, so a plain useEffect would
  // leave the ref stale (false) on the very first collapse frame and let
  // maybeAutoFillViewport fire a server request before the guard activates.
  useLayoutEffect(() => {
    hasCollapsingArticlesRef.current = hasCollapsingArticles;
  }, [hasCollapsingArticles]);
  const [visibleArticleCount, setVisibleArticleCount] = useState(articlesPerPage);
  const loadMoreSentinelRef = useCallback((node: HTMLDivElement | null) => {
    void node;
  }, []);
  const hasRequestedServerLoadRef = useRef(false);
  const hasPendingServerRevealRef = useRef(false);
  const hasPendingBoundaryRearmAfterCooldownRef = useRef(false);
  const isInvertedLoadBoundaryArmedRef = useRef(true);
  const isStandardLoadBoundaryArmedRef = useRef(true);
  const isStandardViewportRefillActiveRef = useRef(false);
  const hasResolvedStandardViewportRevealRef = useRef(false);
  const isMountedRef = useRef(true);
  const invertedPaginationAnchorFrameRef = useRef<null | number>(null);
  const paginationFrameRef = useRef<null | number>(null);
  const normalScrollIntentSuppressionFrameRef = useRef<null | number>(null);
  const lastInvertedScrollTopRef = useRef<null | number>(null);
  const lastStandardScrollTopRef = useRef<null | number>(null);
  const invertedPaginationAnchorRef =
    useRef<InvertedPaginationAnchorState | null>(null);
  const pendingInvertedPaginationAnchorSnapshotRef =
    useRef<null | PendingInvertedPaginationAnchorSnapshot>(null);
  const lastInvertedAwayBoundarySnapshotRef =
    useRef<null | PendingInvertedPaginationAnchorSnapshot>(null);
  const serverLoadCooldownTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const lastAutoFillListHeightRef = useRef<null | number>(null);
  const filteredFeedLengthRef = useRef(filteredFeedLength);
  const previousFilteredFeedLengthRef = useRef(filteredFeedLength);
  const previousIsLoadingMoreRef = useRef(isLoadingMore);
  const previousRefreshEpochRef = useRef(refreshEpoch);
  const visibleArticleCountRef = useRef(articlesPerPage);

  // Scroll handlers can run in the same frame as a new render. Keep this ref
  // aligned during render so boundary decisions never observe a stale feed
  // length between commit and any later effect phase.
  filteredFeedLengthRef.current = filteredFeedLength;

  const clearServerLoadCooldown = useCallback(() => {
    if (serverLoadCooldownTimerRef.current !== null) {
      clearTimeout(serverLoadCooldownTimerRef.current);
      serverLoadCooldownTimerRef.current = null;
    }
  }, []);

  const startServerLoadRearmCooldown = useCallback(() => {
    clearServerLoadCooldown();

    serverLoadCooldownTimerRef.current = setTimeout(() => {
      hasRequestedServerLoadRef.current = false;

      if (hasPendingBoundaryRearmAfterCooldownRef.current) {
        if (isInvertedScroll) {
          isInvertedLoadBoundaryArmedRef.current = true;
        } else {
          isStandardLoadBoundaryArmedRef.current = true;
        }

        hasPendingBoundaryRearmAfterCooldownRef.current = false;
      }

      serverLoadCooldownTimerRef.current = null;
    }, FEED_SERVER_LOAD_REARM_COOLDOWN_MS);
  }, [clearServerLoadCooldown, isInvertedScroll]);

  const commitVisibleArticleCount = useCallback((nextVisibleCount: number) => {
    visibleArticleCountRef.current = nextVisibleCount;

    if (!isMountedRef.current) {
      return;
    }

    setVisibleArticleCount(nextVisibleCount);
  }, []);

  const suppressImmediateNormalScrollIntent = useCallback(() => {
    if (normalScrollIntentSuppressionFrameRef.current !== null) {
      window.cancelAnimationFrame(normalScrollIntentSuppressionFrameRef.current);
    }

    normalScrollIntentSuppressionFrameRef.current = window.requestAnimationFrame(() => {
      normalScrollIntentSuppressionFrameRef.current = null;
    });
  }, []);

  /**
   * Re-arm pagination only after an explicit wheel/touch gesture moves the
   * reader away from the active boundary. Passive scroll shifts caused by page
   * reveals, layout reconciliation, or virtualization must not unlock another
   * server request because that produces self-sustaining load cascades.
   */
  const rearmPaginationBoundaryFromUserIntent = useCallback(() => {
    if (
      !scrollViewport ||
      hasPendingServerRevealRef.current ||
      invertedPaginationAnchorRef.current !== null
    ) {
      return;
    }

    const { hasMovedAwayFromBoundary } = resolvePaginationBoundaryState({
      isInvertedScroll,
      scrollViewport,
    });

    if (hasMovedAwayFromBoundary) {
      if (hasRequestedServerLoadRef.current) {
        hasPendingBoundaryRearmAfterCooldownRef.current = true;
        return;
      }

      if (isInvertedScroll) {
        isInvertedLoadBoundaryArmedRef.current = true;
      } else {
        isStandardLoadBoundaryArmedRef.current = true;
      }

      hasRequestedServerLoadRef.current = false;
    }
  }, [isInvertedScroll, scrollViewport]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const didRefreshEpochChange = previousRefreshEpochRef.current !== refreshEpoch;
    previousRefreshEpochRef.current = refreshEpoch;
    const shouldResetForActiveRefresh =
      didRefreshEpochChange && isRefreshing && !isLoadingMore;

    if (!shouldResetForActiveRefresh) {
      return;
    }

    hasUserScrolledRef.current = false;
    clearServerLoadCooldown();
    hasRequestedServerLoadRef.current = false;
    hasPendingServerRevealRef.current = false;
    hasPendingBoundaryRearmAfterCooldownRef.current = false;
    isInvertedLoadBoundaryArmedRef.current = true;
    isStandardLoadBoundaryArmedRef.current = true;
    isStandardViewportRefillActiveRef.current = false;
    hasResolvedStandardViewportRevealRef.current = false;
    lastAutoFillListHeightRef.current = null;
    previousFilteredFeedLengthRef.current = filteredFeedLengthRef.current;
    lastInvertedScrollTopRef.current = null;
    pendingInvertedPaginationAnchorSnapshotRef.current = null;
    lastInvertedAwayBoundarySnapshotRef.current = null;
    lastStandardScrollTopRef.current = null;
    commitVisibleArticleCount(articlesPerPage);
    onResetInvertedScrollOwnership();
  }, [
    articlesPerPage,
    clearServerLoadCooldown,
    commitVisibleArticleCount,
    hasUserScrolledRef,
    isLoadingMore,
    isRefreshing,
    onResetInvertedScrollOwnership,
    refreshEpoch,
  ]);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    clearServerLoadCooldown();
    hasRequestedServerLoadRef.current = false;
    hasPendingServerRevealRef.current = false;
    hasPendingBoundaryRearmAfterCooldownRef.current = false;
    isInvertedLoadBoundaryArmedRef.current = true;
    isStandardLoadBoundaryArmedRef.current = true;
    isStandardViewportRefillActiveRef.current = false;
    hasResolvedStandardViewportRevealRef.current = false;
    lastAutoFillListHeightRef.current = null;
    previousFilteredFeedLengthRef.current = filteredFeedLengthRef.current;
    lastInvertedScrollTopRef.current = null;
    pendingInvertedPaginationAnchorSnapshotRef.current = null;
    lastInvertedAwayBoundarySnapshotRef.current = null;
    lastStandardScrollTopRef.current = null;
    commitVisibleArticleCount(articlesPerPage);
    onResetInvertedScrollOwnership();
  }, [
    articleFilter,
    articlesPerPage,
    commitVisibleArticleCount,
    feedViewKey,
    hasUserScrolledRef,
    isInvertedScroll,
    onResetInvertedScrollOwnership,
    searchTerm,
    clearServerLoadCooldown,
  ]);

  useLayoutEffect(() => {
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

    hasPendingServerRevealRef.current = false;
    startServerLoadRearmCooldown();

    if (!isInvertedScroll && isStandardViewportRefillActiveRef.current) {
      hasResolvedStandardViewportRevealRef.current = true;
    }

    const currentVisibleCount = visibleArticleCountRef.current;
    if (currentVisibleCount >= filteredFeedLength) {
      return;
    }

    const nextVisibleCount = filteredFeedLength;
    commitVisibleArticleCount(nextVisibleCount);
  }, [
    commitVisibleArticleCount,
    filteredFeedLength,
    isInvertedScroll,
    startServerLoadRearmCooldown,
  ]);

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

    hasPendingServerRevealRef.current = false;
    startServerLoadRearmCooldown();

    if (!isInvertedScroll && isStandardViewportRefillActiveRef.current) {
      hasResolvedStandardViewportRevealRef.current = true;
    }
  }, [isInvertedScroll, isLoadingMore, startServerLoadRearmCooldown]);

  useEffect(() => {
    visibleArticleCountRef.current = visibleArticleCount;
  }, [visibleArticleCount]);

  const requestMoreFromServer = useCallback((options?: {
    isViewportRefill?: boolean;
  }) => {
    if (!canLoadMoreFromServer || !onLoadMore || hasRequestedServerLoadRef.current) {
      return false;
    }

    if (!isInvertedScroll) {
      isStandardViewportRefillActiveRef.current =
        options?.isViewportRefill ?? false;
    }

    hasRequestedServerLoadRef.current = true;
    hasPendingServerRevealRef.current = true;
    hasPendingBoundaryRearmAfterCooldownRef.current = false;
    onLoadMore();
    return true;
  }, [canLoadMoreFromServer, isInvertedScroll, onLoadMore]);

  const releaseInvertedPaginationAnchor = useCallback(() => {
    invertedPaginationAnchorRef.current = null;

    if (invertedPaginationAnchorFrameRef.current !== null) {
      window.cancelAnimationFrame(invertedPaginationAnchorFrameRef.current);
      invertedPaginationAnchorFrameRef.current = null;
    }
  }, []);

  /**
   * Captures the reader-owned inverted viewport position before a top-boundary
   * load scrolls the viewport all the way to zero.
   */
  const capturePendingInvertedPaginationAnchorSnapshot = useCallback(() => {
    if (!isInvertedScroll || !scrollViewport) {
      return;
    }

    const anchorArticleKey = findTopVisibleInvertedPaginationAnchorArticleKey();
    const anchorViewportOffsetTop = getViewportOffsetTop(
      findInvertedExpansionHeaderAnchor(anchorArticleKey) ??
        findInvertedExpansionLockAnchor(anchorArticleKey),
      scrollViewport,
    );

    const nextSnapshot = {
      anchorArticleKey,
      anchorViewportOffsetTop,
      scrollHeight: scrollViewport.scrollHeight,
      scrollTop: scrollViewport.scrollTop,
    };

    pendingInvertedPaginationAnchorSnapshotRef.current = nextSnapshot;

    if (scrollViewport.scrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX) {
      lastInvertedAwayBoundarySnapshotRef.current = nextSnapshot;
    }
  }, [isInvertedScroll, scrollViewport]);

  /**
  * Keeps the inverted prepend settle window alive until measurement settles.
   *
  * Standard mode appends at the bottom without compensation. Inverted mode
  * keeps a timed settle flag so FeedList can hold its wrapper height steady
  * while late ResizeObserver passes land. The scroll correction here preserves
  * the reader's anchor until the new measurements finish settling.
   */
  const syncInvertedPaginationAnchor = useCallback(() => {
    const anchorState = invertedPaginationAnchorRef.current;

    if (!anchorState || !scrollViewport) {
      return;
    }

    const anchorElement =
      findInvertedExpansionHeaderAnchor(anchorState.anchorArticleKey) ??
      findInvertedExpansionLockAnchor(anchorState.anchorArticleKey);
    const shouldWaitForAnchorElement =
      anchorState.anchorArticleKey !== null && anchorElement === null;
    const anchoredScrollTop = anchorElement
      ? scrollViewport.scrollTop +
        getViewportOffsetTop(anchorElement, scrollViewport) -
        anchorState.anchorViewportOffsetTop
      : null;

    const nextScrollTop = shouldWaitForAnchorElement
      ? scrollViewport.scrollTop
      : Math.max(
          0,
          anchoredScrollTop ??
            (anchorState.initialScrollTop +
              (scrollViewport.scrollHeight - anchorState.initialScrollHeight)),
        );

    if (Math.abs(scrollViewport.scrollTop - nextScrollTop) > 0.5) {
      scrollViewport.scrollTop = nextScrollTop;
    }

    lastInvertedScrollTopRef.current = nextScrollTop;

    if (
      !hasRequestedServerLoadRef.current &&
      nextScrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX
    ) {
      isInvertedLoadBoundaryArmedRef.current = true;
    }

    if (performance.now() >= anchorState.releaseAt) {
      invertedPaginationAnchorRef.current = null;
      return;
    }

    if (invertedPaginationAnchorFrameRef.current !== null) {
      window.cancelAnimationFrame(invertedPaginationAnchorFrameRef.current);
    }

    invertedPaginationAnchorFrameRef.current = window.requestAnimationFrame(() => {
      invertedPaginationAnchorFrameRef.current = null;
      syncInvertedPaginationAnchor();
    });
  }, [scrollViewport]);

  /**
   * Arms the height-floor guard for one inverted pagination event.
   *
  * The feed virtualizer owns measurement while this hook owns prepend scroll
  * compensation. We keep a short settle window so later list-height updates do
  * not collapse the wrapper before the prepend fully resolves.
   */
  const primeInvertedPaginationAnchor = useCallback(() => {
    if (!isInvertedScroll || !scrollViewport) {
      return;
    }

    const pendingAnchorSnapshot = pendingInvertedPaginationAnchorSnapshotRef.current;
    const lastAwayBoundarySnapshot = lastInvertedAwayBoundarySnapshotRef.current;
    const shouldUsePendingAnchorSnapshot =
      pendingAnchorSnapshot !== null &&
      pendingAnchorSnapshot.scrollTop > scrollViewport.scrollTop;
    const shouldUseLastAwayBoundarySnapshot =
      !shouldUsePendingAnchorSnapshot &&
      lastAwayBoundarySnapshot !== null &&
      scrollViewport.scrollTop <= FEED_INVERTED_LOAD_MORE_THRESHOLD_PX;
    const selectedAnchorSnapshot = shouldUsePendingAnchorSnapshot
      ? pendingAnchorSnapshot
      : shouldUseLastAwayBoundarySnapshot
        ? lastAwayBoundarySnapshot
        : null;
    const preservedInitialScrollTop = shouldUsePendingAnchorSnapshot
      ? pendingAnchorSnapshot.scrollTop
      : shouldUseLastAwayBoundarySnapshot
        ? lastAwayBoundarySnapshot.scrollTop
      : scrollViewport.scrollTop <= FEED_INVERTED_LOAD_MORE_THRESHOLD_PX
        ? Math.max(
            scrollViewport.scrollTop,
            lastInvertedScrollTopRef.current ?? scrollViewport.scrollTop,
          )
        : scrollViewport.scrollTop;
    const anchorArticleKey = selectedAnchorSnapshot
      ? selectedAnchorSnapshot.anchorArticleKey
      : findTopVisibleInvertedPaginationAnchorArticleKey();
    const anchorViewportOffsetTop = selectedAnchorSnapshot
      ? selectedAnchorSnapshot.anchorViewportOffsetTop
      : getViewportOffsetTop(
          findInvertedExpansionHeaderAnchor(anchorArticleKey) ??
            findInvertedExpansionLockAnchor(anchorArticleKey),
          scrollViewport,
        );

    invertedPaginationAnchorRef.current = {
      anchorArticleKey,
      anchorViewportOffsetTop,
      initialScrollHeight: selectedAnchorSnapshot
        ? selectedAnchorSnapshot.scrollHeight
        : scrollViewport.scrollHeight,
      initialScrollTop: preservedInitialScrollTop,
      releaseAt: performance.now() + INVERTED_PAGINATION_ANCHOR_SYNC_WINDOW_MS,
    };

    pendingInvertedPaginationAnchorSnapshotRef.current = null;

    syncInvertedPaginationAnchor();
  }, [isInvertedScroll, scrollViewport, syncInvertedPaginationAnchor]);

  /** Expands the current page by one batch without overshooting the filtered feed size. */
  const expandVisibleWindow = useCallback(() => {
    const currentCount = visibleArticleCountRef.current;
    const currentFilteredFeedLength = filteredFeedLengthRef.current;

    const nextVisibleCount = resolveNextVisibleCount({
      articlesPerPage,
      currentVisibleCount: currentCount,
      filteredFeedLength: currentFilteredFeedLength,
    });

    if (nextVisibleCount === currentCount) {
      return false;
    }

    commitVisibleArticleCount(nextVisibleCount);

    return nextVisibleCount > currentCount;
  }, [articlesPerPage, commitVisibleArticleCount]);

  /** Standard mode only advances once the viewport has actually reached the bottom edge. */
  const hasReachedStandardLoadBoundary = useCallback(() => {
    if (!scrollViewport || isInvertedScroll) {
      return false;
    }

    return resolvePaginationBoundaryState({
      isInvertedScroll: false,
      scrollViewport,
    }).hasReachedBoundary;
  }, [isInvertedScroll, scrollViewport]);

  /**
   * Loads the next page only from the owning trigger for the current mode.
   *
   * Standard mode advances from the bottom sentinel only. Inverted mode keeps
   * using the top-edge distance check because its sentinel sits above the list.
   */
  const maybeLoadNextPage = useCallback((_trigger: "scroll" | "sentinel") => {
    if (!scrollViewport) {
      return;
    }

    if (!hasUserScrolledRef.current) {
      return;
    }

    // Collapse animations temporarily shrink the list height, which can push
    // the sentinel into the viewport and bring scroll position near the
    // inverted boundary. Neither constitutes real user intent — gate both
    // paths so no page load fires until all collapse animations have settled.
    if (hasCollapsingArticlesRef.current) {
      return;
    }

    const currentVisibleCount = visibleArticleCountRef.current;
    const currentFilteredFeedLength = filteredFeedLengthRef.current;

    if (isInvertedScroll) {
      const hasReachedInvertedLoadBoundary = resolvePaginationBoundaryState({
        isInvertedScroll: true,
        scrollViewport,
      }).hasReachedBoundary;

      if (!hasReachedInvertedLoadBoundary) {
        return;
      }

      if (!isInvertedLoadBoundaryArmedRef.current) {
        return;
      }

      if (currentVisibleCount >= currentFilteredFeedLength) {
        primeInvertedPaginationAnchor();
        if (requestMoreFromServer()) {
          isInvertedLoadBoundaryArmedRef.current = false;
        }
        return;
      }

      primeInvertedPaginationAnchor();

      // Flush the visibleArticleCount state update synchronously so the
      // virtualizer receives its new data within the current task. This makes
      // measurement settle in the next animation frame (~16 ms) instead of
      // the ~500 ms async scheduling window — eliminating the visible flash
      // at scrollTop ≈ 0 before the anchor restoration settles.
      flushSync(() => {
        if (expandVisibleWindow()) {
          isInvertedLoadBoundaryArmedRef.current = false;
        }
      });

      return;
    }

    const hasReachedStandardBoundary = hasReachedStandardLoadBoundary();

    if (!hasReachedStandardBoundary) {
      return;
    }

    if (!isStandardLoadBoundaryArmedRef.current) {
      return;
    }

    if (currentVisibleCount >= currentFilteredFeedLength) {
      if (requestMoreFromServer()) {
        isStandardLoadBoundaryArmedRef.current = false;
      }
      return;
    }

    if (expandVisibleWindow()) {
      isStandardLoadBoundaryArmedRef.current = false;
    }
  }, [
    expandVisibleWindow,
    hasReachedStandardLoadBoundary,
    hasUserScrolledRef,
    isInvertedScroll,
    primeInvertedPaginationAnchor,
    requestMoreFromServer,
    scrollViewport,
  ]);

  /**
   * Expands the current page only when the active list height still cannot scroll.
   * Virtualized callers can pass the committed list height to avoid stale external
  * viewport measurements while the virtualizer is still applying its wrapper size.
   */
  const maybeAutoFillViewport = useCallback((committedListHeight?: number) => {
    const currentFilteredFeedLength = filteredFeedLengthRef.current;
    const hasUserScrolled = hasUserScrolledRef.current;

    if (
      !scrollViewport ||
      isInitialLoading ||
      (!canLoadMoreFromServer &&
        visibleArticleCountRef.current >= currentFilteredFeedLength)
    ) {
      return;
    }

    const effectiveListHeight =
      typeof committedListHeight === "number" &&
      Number.isFinite(committedListHeight) &&
      committedListHeight > 0
        ? committedListHeight
        : scrollViewport.scrollHeight;
    const previousListHeight = lastAutoFillListHeightRef.current;
    const hasListShrunk =
      previousListHeight !== null &&
      previousListHeight - effectiveListHeight > STANDARD_VIEWPORT_REFILL_SHRINK_THRESHOLD_PX;
    const shouldAllowStandardViewportRefill =
      !isInvertedScroll &&
      (isStandardViewportRefillActiveRef.current || (hasUserScrolled && hasListShrunk));

    lastAutoFillListHeightRef.current = effectiveListHeight;

    if (hasUserScrolled && !shouldAllowStandardViewportRefill) {
      return;
    }

    const shouldContinueAutoFill = shouldAutoFillViewport({
      clientHeight: scrollViewport.clientHeight,
      committedListHeight: effectiveListHeight,
      currentVisibleCount: visibleArticleCountRef.current,
      filteredFeedLength: currentFilteredFeedLength,
      hasUserScrolled: hasUserScrolled && !shouldAllowStandardViewportRefill,
      isInitialLoading,
    });

    if (!shouldContinueAutoFill) {
      if (!isInvertedScroll) {
        isStandardViewportRefillActiveRef.current = false;
      }

      return;
    }

    if (!isInvertedScroll) {
      isStandardViewportRefillActiveRef.current = true;
    }

    const currentVisibleCount = visibleArticleCountRef.current;

    if (currentVisibleCount < currentFilteredFeedLength) {
      expandVisibleWindow();
      return;
    }

    if (!isInvertedScroll) {
      if (
        hasPendingServerRevealRef.current ||
        hasRequestedServerLoadRef.current
      ) {
        return;
      }

      if (requestMoreFromServer({ isViewportRefill: true })) {
        return;
      }

      isStandardViewportRefillActiveRef.current = false;
    }
  }, [
    canLoadMoreFromServer,
    expandVisibleWindow,
    hasUserScrolledRef,
    isInitialLoading,
    isInvertedScroll,
    requestMoreFromServer,
    scrollViewport,
  ]);

  /**
   * Backfills a depleted revealed window after local unread removals.
   *
   * Standard mode can append directly. Inverted mode must first prime the
   * anchor so the prepend keeps the reader's viewport stable.
   */
  const maybeBackfillDepletedRevealedPage = useCallback(() => {
    if (
      !canLoadMoreFromServer ||
      hasPendingServerRevealRef.current ||
      hasRequestedServerLoadRef.current
    ) {
      return;
    }

    const currentVisibleCount = visibleArticleCountRef.current;
    const unreadRefillThreshold = resolveUnreadRefillThreshold(articlesPerPage);
    const hasDepletedRevealedWindow =
      articleFilter === "unread"
        ? filteredFeedLength < unreadRefillThreshold
        : filteredFeedLength < currentVisibleCount;

    if (!hasDepletedRevealedWindow) {
      return;
    }

    if (isInvertedScroll) {
      primeInvertedPaginationAnchor();
    }

    void requestMoreFromServer({ isViewportRefill: true });
  }, [
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer,
    filteredFeedLength,
    isInvertedScroll,
    primeInvertedPaginationAnchor,
    requestMoreFromServer,
  ]);

  useLayoutEffect(() => {
    maybeBackfillDepletedRevealedPage();
  }, [filteredFeedLength, maybeBackfillDepletedRevealedPage]);

  useLayoutEffect(() => {
    if (
      isInvertedScroll ||
      !hasResolvedStandardViewportRevealRef.current
    ) {
      return;
    }

    hasResolvedStandardViewportRevealRef.current = false;
    maybeAutoFillViewport();
  }, [filteredFeedLength, isInvertedScroll, maybeAutoFillViewport]);

  const shouldUseVirtualizedFeed = !isInitialLoading && scrollViewport !== null;
  const shouldObserveLoadMoreBoundary =
    canLoadMoreFromServer || visibleArticleCount < filteredFeedLength;

  useEffect(() => {
    if (
      !scrollViewport ||
      shouldUseVirtualizedFeed ||
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
    shouldUseVirtualizedFeed,
    visibleArticleCount,
  ]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    lastStandardScrollTopRef.current = isInvertedScroll
      ? null
      : scrollViewport.scrollTop;
    lastInvertedScrollTopRef.current = isInvertedScroll
      ? scrollViewport.scrollTop
      : null;

    const rearmStandardBoundaryFromScrollPosition = () => {
      if (
        isInvertedScroll ||
        hasPendingServerRevealRef.current ||
        invertedPaginationAnchorRef.current !== null
      ) {
        return;
      }

      const currentScrollTop = scrollViewport.scrollTop;
      const hasMovedAwayFromBoundary = hasMovedAwayFromBoundarySincePreviousScroll({
        isInvertedScroll: false,
        previousScrollTop: lastStandardScrollTopRef.current,
        scrollViewport,
      });

      lastStandardScrollTopRef.current = currentScrollTop;

      if (hasMovedAwayFromBoundary) {
        if (hasRequestedServerLoadRef.current) {
          hasPendingBoundaryRearmAfterCooldownRef.current = true;
          return;
        }

        isStandardLoadBoundaryArmedRef.current = true;
        hasPendingBoundaryRearmAfterCooldownRef.current = false;
        hasRequestedServerLoadRef.current = false;
      }
    };

    const rearmInvertedBoundaryFromScrollPosition = () => {
      const currentScrollTop = scrollViewport.scrollTop;

      if (
        !isInvertedScroll ||
        hasPendingServerRevealRef.current ||
        invertedPaginationAnchorRef.current !== null
      ) {
        lastInvertedScrollTopRef.current = currentScrollTop;
        return;
      }

      const hasMovedAwayFromBoundary = hasMovedAwayFromBoundarySincePreviousScroll({
        isInvertedScroll: true,
        previousScrollTop: lastInvertedScrollTopRef.current,
        scrollViewport,
      });

      lastInvertedScrollTopRef.current = currentScrollTop;

      if (!hasMovedAwayFromBoundary) {
        return;
      }

      if (hasRequestedServerLoadRef.current) {
        hasPendingBoundaryRearmAfterCooldownRef.current = true;
        return;
      }

      isInvertedLoadBoundaryArmedRef.current = true;
      hasPendingBoundaryRearmAfterCooldownRef.current = false;
      hasRequestedServerLoadRef.current = false;
    };

    const handleScrollIntent = () => {
      if (hasActiveInvertedExpansionScrollLock()) {
        onReleaseInvertedExpansionScrollLock();
      }

      if (isInvertedScroll) {
        if (scrollViewport.scrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX) {
          capturePendingInvertedPaginationAnchorSnapshot();
        }

        lastInvertedScrollTopRef.current = scrollViewport.scrollTop;
        releaseInvertedPaginationAnchor();
        onClaimInvertedScrollOwnership();
      } else {
        clearInitialNormalScrollLock();
      }

      hasUserScrolledRef.current = true;

      if (
        isInvertedScroll &&
        scrollViewport.scrollTop <= FEED_INVERTED_LOAD_MORE_THRESHOLD_PX &&
        !hasRequestedServerLoadRef.current
      ) {
        isInvertedLoadBoundaryArmedRef.current = true;
      }

      rearmPaginationBoundaryFromUserIntent();

      if (paginationFrameRef.current !== null) {
        return;
      }

      paginationFrameRef.current = window.requestAnimationFrame(() => {
        paginationFrameRef.current = null;
        maybeLoadNextPage("scroll");
      });
    };

    const handleViewportScroll = () => {
      if (hasActiveInvertedExpansionScrollLock()) {
        onSyncInvertedExpansionScrollLock();
        return;
      }

      if (isInvertedScroll) {
        const maxScrollTop = Math.max(
          0,
          scrollViewport.scrollHeight - scrollViewport.clientHeight,
        );

        if (scrollViewport.scrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX) {
          capturePendingInvertedPaginationAnchorSnapshot();
        }

        if (scrollViewport.scrollTop < maxScrollTop - 1) {
          releaseInvertedPaginationAnchor();
          onClaimInvertedScrollOwnership();
          hasUserScrolledRef.current = true;
        }

        if (hasUserScrolledRef.current) {
          rearmInvertedBoundaryFromScrollPosition();
        }
      }

      if (shouldLockInitialNormalScroll() && !isInvertedScroll) {
        if (scrollViewport.scrollTop === 0) {
          return;
        }

        clearInitialNormalScrollLock();
        suppressImmediateNormalScrollIntent();
        return;
      }

      if (
        !isInvertedScroll &&
        normalScrollIntentSuppressionFrameRef.current !== null
      ) {
        return;
      }

      if (scrollViewport.scrollTop > 0 && !isInvertedScroll) {
        hasUserScrolledRef.current = true;
      }

      if (!isInvertedScroll && hasUserScrolledRef.current) {
        rearmStandardBoundaryFromScrollPosition();
      }

      maybeLoadNextPage("scroll");
    };

    scrollViewport.addEventListener("scroll", handleViewportScroll, {
      passive: true,
    });
    scrollViewport.addEventListener("touchmove", handleScrollIntent, {
      passive: true,
    });
    scrollViewport.addEventListener("wheel", handleScrollIntent, {
      passive: true,
    });

    return () => {
      if (paginationFrameRef.current !== null) {
        window.cancelAnimationFrame(paginationFrameRef.current);
        paginationFrameRef.current = null;
      }

      if (normalScrollIntentSuppressionFrameRef.current !== null) {
        window.cancelAnimationFrame(normalScrollIntentSuppressionFrameRef.current);
        normalScrollIntentSuppressionFrameRef.current = null;
      }

      scrollViewport.removeEventListener("scroll", handleViewportScroll);
      scrollViewport.removeEventListener("touchmove", handleScrollIntent);
      scrollViewport.removeEventListener("wheel", handleScrollIntent);
    };
  }, [
    clearInitialNormalScrollLock,
    hasActiveInvertedExpansionScrollLock,
    hasUserScrolledRef,
    isInvertedScroll,
    maybeLoadNextPage,
    onClaimInvertedScrollOwnership,
    capturePendingInvertedPaginationAnchorSnapshot,
    onReleaseInvertedExpansionScrollLock,
    rearmPaginationBoundaryFromUserIntent,
    releaseInvertedPaginationAnchor,
    scrollViewport,
    suppressImmediateNormalScrollIntent,
    onSyncInvertedExpansionScrollLock,
    shouldLockInitialNormalScroll,
  ]);

  useEffect(() => {
    if (
      !scrollViewport ||
      typeof IntersectionObserver !== "function" ||
      !shouldObserveLoadMoreBoundary
    ) {
      return;
    }

    const sentinel = scrollViewport.querySelector<HTMLDivElement>(
      "[data-feed-load-more-sentinel='true']",
    );
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        if (shouldLockInitialNormalScroll() && !isInvertedScroll) {
          if (scrollViewport.scrollTop === 0) {
            return;
          }

          clearInitialNormalScrollLock();
          suppressImmediateNormalScrollIntent();
          return;
        }

        if (
          !isInvertedScroll &&
          normalScrollIntentSuppressionFrameRef.current !== null
        ) {
          return;
        }

        if (scrollViewport.scrollTop > 0 && !isInvertedScroll) {
          hasUserScrolledRef.current = true;
        }

        if (paginationFrameRef.current !== null) {
          return;
        }

        paginationFrameRef.current = window.requestAnimationFrame(() => {
          paginationFrameRef.current = null;
          maybeLoadNextPage("sentinel");
        });
      },
      {
        root: scrollViewport,
        rootMargin: isInvertedScroll
          ? `${FEED_INVERTED_LOAD_MORE_THRESHOLD_PX}px 0px 0px 0px`
          : `0px 0px ${FEED_LOAD_MORE_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
    // filteredFeedLength and visibleArticleCount are intentionally excluded.
    // Including them causes the IO to re-register on every article reveal
    // (server-load response), which immediately fires the callback again and
    // triggers a cascade of additional server loads. The callback reads current
    // values via refs (filteredFeedLengthRef, visibleArticleCountRef), so
    // stale-closure correctness is maintained without re-registering.
     
  }, [
    clearInitialNormalScrollLock,
    hasUserScrolledRef,
    isInvertedScroll,
    maybeLoadNextPage,
    scrollViewport,
    shouldObserveLoadMoreBoundary,
    shouldLockInitialNormalScroll,
    suppressImmediateNormalScrollIntent,
  ]);

  useEffect(() => {
    return () => {
      clearServerLoadCooldown();
      hasPendingBoundaryRearmAfterCooldownRef.current = false;

      if (invertedPaginationAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(invertedPaginationAnchorFrameRef.current);
      }

      if (paginationFrameRef.current !== null) {
        window.cancelAnimationFrame(paginationFrameRef.current);
      }

      if (normalScrollIntentSuppressionFrameRef.current !== null) {
        window.cancelAnimationFrame(normalScrollIntentSuppressionFrameRef.current);
      }
    };
  }, [clearServerLoadCooldown]);

  return {
    invertedPaginationAnchorRef,
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    shouldUseVirtualizedFeed,
    syncInvertedPaginationAnchor,
    visibleArticleCount,
  };
}


/**
 * Mirrors the dashboard controller's unread refill contract at the list level.
 *
 * List-owned unread removals can shrink a previously revealed multi-page window,
 * but that alone is not justification to pull another server page. Keep at least
 * one page plus a minimal overflow article buffered before requesting more.
 */
function resolveUnreadRefillThreshold(articlesPerPage: number) {
  return Math.max(0, articlesPerPage + MIN_UNREAD_REFILL_OVERFLOW_ARTICLES);
}
