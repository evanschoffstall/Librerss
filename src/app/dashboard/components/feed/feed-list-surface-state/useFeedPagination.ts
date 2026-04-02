import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
  FEED_LOAD_MORE_THRESHOLD_PX,
} from "./constants";
import {
  resolveNextVisibleCount,
  resolvePaginationBoundaryState,
  shouldAutoFillViewport,
} from "./paginationRules";

interface InvertedPaginationAnchorState {
  initialScrollHeight: number;
  initialScrollTop: number;
  releaseAt: number;
}

const INVERTED_PAGINATION_ANCHOR_SYNC_WINDOW_MS = 1_500;


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
  onClaimInvertedScrollOwnership,
  onLoadMore,
  onReleaseInvertedExpansionScrollLock,
  onResetInvertedScrollOwnership,
  onSyncInvertedExpansionScrollLock,
  refreshEpoch: _refreshEpoch,
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
  const isInvertedLoadBoundaryArmedRef = useRef(true);
  const isStandardLoadBoundaryArmedRef = useRef(true);
  const isMountedRef = useRef(true);
  const invertedPaginationAnchorFrameRef = useRef<null | number>(null);
  const paginationFrameRef = useRef<null | number>(null);
  const invertedPaginationAnchorRef =
    useRef<InvertedPaginationAnchorState | null>(null);
  const filteredFeedLengthRef = useRef(filteredFeedLength);
  const previousFilteredFeedLengthRef = useRef(filteredFeedLength);
  const visibleArticleCountRef = useRef(articlesPerPage);

  const commitVisibleArticleCount = useCallback((nextVisibleCount: number) => {
    visibleArticleCountRef.current = nextVisibleCount;

    if (!isMountedRef.current) {
      return;
    }

    setVisibleArticleCount(nextVisibleCount);
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
    filteredFeedLengthRef.current = filteredFeedLength;
  }, [commitVisibleArticleCount, filteredFeedLength]);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    hasRequestedServerLoadRef.current = false;
    hasPendingServerRevealRef.current = false;
    isInvertedLoadBoundaryArmedRef.current = true;
    isStandardLoadBoundaryArmedRef.current = true;
    previousFilteredFeedLengthRef.current = filteredFeedLengthRef.current;
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
  ]);

  useLayoutEffect(() => {
    const previousFilteredFeedLength = previousFilteredFeedLengthRef.current;
    previousFilteredFeedLengthRef.current = filteredFeedLength;

    if (
      !hasPendingServerRevealRef.current ||
      filteredFeedLength <= previousFilteredFeedLength
    ) {
      return;
    }

    hasPendingServerRevealRef.current = false;

    const currentVisibleCount = visibleArticleCountRef.current;
    if (currentVisibleCount >= filteredFeedLength) {
      return;
    }

    const nextVisibleCount = filteredFeedLength;
    commitVisibleArticleCount(nextVisibleCount);
  }, [commitVisibleArticleCount, filteredFeedLength]);

  useEffect(() => {
    visibleArticleCountRef.current = visibleArticleCount;
  }, [visibleArticleCount]);

  const requestMoreFromServer = useCallback(() => {
    if (!canLoadMoreFromServer || !onLoadMore || hasRequestedServerLoadRef.current) {
      return false;
    }

    hasRequestedServerLoadRef.current = true;
    hasPendingServerRevealRef.current = true;
    onLoadMore();
    return true;
  }, [canLoadMoreFromServer, onLoadMore]);

  const releaseInvertedPaginationAnchor = useCallback(() => {
    invertedPaginationAnchorRef.current = null;

    if (invertedPaginationAnchorFrameRef.current !== null) {
      window.cancelAnimationFrame(invertedPaginationAnchorFrameRef.current);
      invertedPaginationAnchorFrameRef.current = null;
    }
  }, []);

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

    const nextScrollTop = Math.max(
      0,
      anchorState.initialScrollTop +
        (scrollViewport.scrollHeight - anchorState.initialScrollHeight),
    );

    if (Math.abs(scrollViewport.scrollTop - nextScrollTop) > 0.5) {
      scrollViewport.scrollTop = nextScrollTop;
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

    invertedPaginationAnchorRef.current = {
      initialScrollHeight: scrollViewport.scrollHeight,
      initialScrollTop: scrollViewport.scrollTop,
      releaseAt: performance.now() + INVERTED_PAGINATION_ANCHOR_SYNC_WINDOW_MS,
    };

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

    // Auto-fill exists only to make an idle surface scrollable on first paint.
    // Once the reader owns the viewport, transient underfill from prepend
    // compensation, dynamic row measurement, or collapse reconciliation must
    // not reveal extra pages automatically. From that point forward, pagination
    // is owned exclusively by explicit boundary reaches in maybeLoadNextPage.
    if (hasUserScrolled) {
      return;
    }

    const effectiveListHeight =
      typeof committedListHeight === "number" &&
      Number.isFinite(committedListHeight) &&
      committedListHeight > 0
        ? committedListHeight
        : scrollViewport.scrollHeight;

    if (
      shouldAutoFillViewport({
        clientHeight: scrollViewport.clientHeight,
        committedListHeight: effectiveListHeight,
        currentVisibleCount: visibleArticleCountRef.current,
        filteredFeedLength: currentFilteredFeedLength,
        hasUserScrolled,
        isInitialLoading,
      })
    ) {
      const currentVisibleCount = visibleArticleCountRef.current;

      if (currentVisibleCount < currentFilteredFeedLength) {
        expandVisibleWindow();
      }
    }
  }, [
    canLoadMoreFromServer,
    expandVisibleWindow,
    hasUserScrolledRef,
    isInitialLoading,
    scrollViewport,
  ]);

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

    const handleScrollIntent = () => {
      if (hasActiveInvertedExpansionScrollLock()) {
        onReleaseInvertedExpansionScrollLock();
      }

      if (isInvertedScroll) {
        releaseInvertedPaginationAnchor();
        onClaimInvertedScrollOwnership();
      } else {
        clearInitialNormalScrollLock();
      }

      hasUserScrolledRef.current = true;

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

        if (scrollViewport.scrollTop < maxScrollTop - 1) {
          releaseInvertedPaginationAnchor();
          onClaimInvertedScrollOwnership();
          hasUserScrolledRef.current = true;
        }
      }

      if (shouldLockInitialNormalScroll() && !isInvertedScroll) {
        if (scrollViewport.scrollTop === 0) {
          return;
        }

        clearInitialNormalScrollLock();
      }

      if (scrollViewport.scrollTop > 0 && !isInvertedScroll) {
        hasUserScrolledRef.current = true;
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
    onReleaseInvertedExpansionScrollLock,
    rearmPaginationBoundaryFromUserIntent,
    releaseInvertedPaginationAnchor,
    onSyncInvertedExpansionScrollLock,
    scrollViewport,
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
    hasUserScrolledRef,
    isInvertedScroll,
    maybeLoadNextPage,
    scrollViewport,
    shouldObserveLoadMoreBoundary,
  ]);

  useEffect(() => {
    return () => {
      if (invertedPaginationAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(invertedPaginationAnchorFrameRef.current);
      }

      if (paginationFrameRef.current !== null) {
        window.cancelAnimationFrame(paginationFrameRef.current);
      }
    };
  }, []);

  return {
    invertedPaginationAnchorRef,
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    shouldUseVirtualizedFeed,
    syncInvertedPaginationAnchor,
    visibleArticleCount,
  };
}
