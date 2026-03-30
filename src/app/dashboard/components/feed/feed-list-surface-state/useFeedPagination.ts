import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
  FEED_LOAD_MORE_THRESHOLD_PX,
  FEED_MIN_SCROLLABLE_OVERFLOW_PX,
} from "./constants";

interface UseFeedPaginationOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer?: boolean;
  clearInitialNormalScrollLock: () => void;
  feedViewKey: string;
  filteredFeedLength: number;
  hasActiveInvertedExpansionScrollLock: () => boolean;
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
  hasUserScrolledRef,
  isInitialLoading,
  isInvertedScroll,
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
  const [visibleArticleCount, setVisibleArticleCount] = useState(articlesPerPage);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasRequestedServerLoadRef = useRef(false);
  const hasPendingServerRevealRef = useRef(false);
  const isInvertedLoadBoundaryArmedRef = useRef(true);
  const paginationFrameRef = useRef<null | number>(null);
  const filteredFeedLengthRef = useRef(filteredFeedLength);
  const previousFilteredFeedLengthRef = useRef(filteredFeedLength);
  const visibleArticleCountRef = useRef(articlesPerPage);

  useEffect(() => {
    filteredFeedLengthRef.current = filteredFeedLength;
  }, [filteredFeedLength]);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    hasRequestedServerLoadRef.current = false;
    hasPendingServerRevealRef.current = false;
    isInvertedLoadBoundaryArmedRef.current = true;
    previousFilteredFeedLengthRef.current = filteredFeedLengthRef.current;
    visibleArticleCountRef.current = articlesPerPage;
    onResetInvertedScrollOwnership();
    setVisibleArticleCount(articlesPerPage);
  }, [
    articleFilter,
    articlesPerPage,
    feedViewKey,
    hasUserScrolledRef,
    isInvertedScroll,
    onResetInvertedScrollOwnership,
    refreshEpoch,
    searchTerm,
  ]);

  useEffect(() => {
    hasRequestedServerLoadRef.current = false;
  }, [filteredFeedLength]);

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
    visibleArticleCountRef.current = nextVisibleCount;
    setVisibleArticleCount(nextVisibleCount);
  }, [filteredFeedLength]);

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

  /** Expands the current page by one batch without overshooting the filtered feed size. */
  const expandVisibleWindow = useCallback(() => {
    const currentCount = visibleArticleCountRef.current;
    if (currentCount >= filteredFeedLength) {
      return false;
    }

    const nextVisibleCount = Math.min(
      currentCount + articlesPerPage,
      filteredFeedLength,
    );
    visibleArticleCountRef.current = nextVisibleCount;
    setVisibleArticleCount(nextVisibleCount);

    return nextVisibleCount > currentCount;
  }, [articlesPerPage, filteredFeedLength]);

  /** Standard mode only advances once the viewport has actually reached the bottom edge. */
  const hasReachedStandardLoadBoundary = useCallback(() => {
    if (!scrollViewport || isInvertedScroll) {
      return false;
    }

    const remainingDistance =
      scrollViewport.scrollHeight -
      (scrollViewport.scrollTop + scrollViewport.clientHeight);

    return (
      Number.isFinite(remainingDistance) &&
      remainingDistance <= FEED_MIN_SCROLLABLE_OVERFLOW_PX
    );
  }, [isInvertedScroll, scrollViewport]);

  /**
   * Loads the next page only from the owning trigger for the current mode.
   *
   * Standard mode advances from the bottom sentinel only. Inverted mode keeps
   * using the top-edge distance check because its sentinel sits above the list.
   */
  const maybeLoadNextPage = useCallback((trigger: "scroll" | "sentinel") => {
    if (!scrollViewport) {
      return;
    }

    if (!hasUserScrolledRef.current) {
      return;
    }

    const currentVisibleCount = visibleArticleCountRef.current;

    if (isInvertedScroll) {
      const hasReachedInvertedLoadBoundary =
        Number.isFinite(scrollViewport.scrollTop) &&
        scrollViewport.scrollTop <= FEED_INVERTED_LOAD_MORE_THRESHOLD_PX;

      if (!hasReachedInvertedLoadBoundary) {
        isInvertedLoadBoundaryArmedRef.current = true;
        return;
      }

      if (!isInvertedLoadBoundaryArmedRef.current) {
        return;
      }

      if (currentVisibleCount >= filteredFeedLength) {
        if (requestMoreFromServer()) {
          isInvertedLoadBoundaryArmedRef.current = false;
        }
        return;
      }

      if (expandVisibleWindow()) {
        isInvertedLoadBoundaryArmedRef.current = false;
      }
      return;
    }

    if (currentVisibleCount >= filteredFeedLength) {
      if (
        trigger === "sentinel" ||
        hasReachedStandardLoadBoundary()
      ) {
        requestMoreFromServer();
      }
      return;
    }

    if (trigger === "sentinel" || hasReachedStandardLoadBoundary()) {
      expandVisibleWindow();
    }
  }, [
    expandVisibleWindow,
    filteredFeedLength,
    hasReachedStandardLoadBoundary,
    hasUserScrolledRef,
    isInvertedScroll,
    requestMoreFromServer,
    scrollViewport,
  ]);

  /** Expands the current page only when the measured viewport still cannot scroll. */
  const maybeAutoFillViewport = useCallback(() => {
    if (
      !scrollViewport ||
      isInitialLoading ||
      (!canLoadMoreFromServer &&
        visibleArticleCountRef.current >= filteredFeedLength)
    ) {
      return;
    }

    const scrollableOverflowPx =
      scrollViewport.scrollHeight - scrollViewport.clientHeight;

    if (
      Number.isFinite(scrollableOverflowPx) &&
      scrollableOverflowPx <= FEED_MIN_SCROLLABLE_OVERFLOW_PX
    ) {
      const currentVisibleCount = visibleArticleCountRef.current;

      if (currentVisibleCount < filteredFeedLength) {
        expandVisibleWindow();
        return;
      }

      if (!hasUserScrolledRef.current) {
        return;
      }

      requestMoreFromServer();
    }
  }, [
    canLoadMoreFromServer,
    expandVisibleWindow,
    filteredFeedLength,
    hasUserScrolledRef,
    isInitialLoading,
    requestMoreFromServer,
    scrollViewport,
  ]);

  const shouldUseVirtualizedFeed = !isInitialLoading && scrollViewport !== null;

  useEffect(() => {
    if (
      !scrollViewport ||
      isInitialLoading ||
      visibleArticleCount >= filteredFeedLength
    ) {
      return;
    }

    let settledAutoFillFrameId: null | number = null;
    const autoFillFrameId = requestAnimationFrame(() => {
      if (shouldUseVirtualizedFeed && scrollViewport.scrollHeight <= 0) {
        settledAutoFillFrameId = requestAnimationFrame(() => {
          maybeAutoFillViewport();
        });
        return;
      }

      maybeAutoFillViewport();
    });

    return () => {
      cancelAnimationFrame(autoFillFrameId);
      if (settledAutoFillFrameId !== null) {
        cancelAnimationFrame(settledAutoFillFrameId);
      }
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
        onClaimInvertedScrollOwnership();
      } else {
        clearInitialNormalScrollLock();
      }

      hasUserScrolledRef.current = true;
    };

    const handleViewportScroll = () => {
      if (hasActiveInvertedExpansionScrollLock()) {
        onSyncInvertedExpansionScrollLock();
        return;
      }

      if (shouldLockInitialNormalScroll() && !isInvertedScroll) {
        if (scrollViewport.scrollTop !== 0) {
          scrollViewport.scrollTop = 0;
        }
        return;
      }

      if (scrollViewport.scrollTop > 0 && !isInvertedScroll) {
        hasUserScrolledRef.current = true;
      }

      if (
        isInvertedScroll &&
        Number.isFinite(scrollViewport.scrollTop) &&
        scrollViewport.scrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX
      ) {
        isInvertedLoadBoundaryArmedRef.current = true;
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
        cancelAnimationFrame(paginationFrameRef.current);
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
    onSyncInvertedExpansionScrollLock,
    scrollViewport,
    shouldLockInitialNormalScroll,
  ]);

  useEffect(() => {
    if (
      !scrollViewport ||
      typeof IntersectionObserver !== "function" ||
      (visibleArticleCount >= filteredFeedLength && !canLoadMoreFromServer)
    ) {
      return;
    }

    const sentinel = loadMoreSentinelRef.current;
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

        paginationFrameRef.current = requestAnimationFrame(() => {
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
  }, [
    canLoadMoreFromServer,
    filteredFeedLength,
    hasUserScrolledRef,
    isInvertedScroll,
    maybeLoadNextPage,
    scrollViewport,
    visibleArticleCount,
  ]);

  useEffect(() => {
    return () => {
      if (paginationFrameRef.current !== null) {
        cancelAnimationFrame(paginationFrameRef.current);
      }
    };
  }, []);

  return {
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    shouldUseVirtualizedFeed,
    visibleArticleCount,
  };
}