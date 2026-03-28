import { type ComponentPropsWithRef, forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const FEED_LOAD_MORE_THRESHOLD_PX = 504;
const FEED_MIN_SCROLLABLE_OVERFLOW_PX = 1;

type FeedSurfaceMode = "empty" | "plain" | "skeleton" | "virtualized";
type FeedViewportResolutionState = "missing" | "pending" | "ready";

interface UseFeedListSurfaceStateOptions {
  articleFilter: string;
  articlesPerPage: number;
  expandedArticleKey: null | string;
  feedViewKey: string;
  filteredFeedLength: number;
  invertedScrollAnchorIndex: number;
  isCollapseScrollRestoreActive: boolean;
  isInitialLoading: boolean;
  /** When true the feed renders bottom-to-top (newest at bottom, pagination at top). */
  isInvertedScroll: boolean;
  refreshEpoch: number;
  searchTerm: string;
}

export function useFeedListSurfaceState({
  articleFilter,
  articlesPerPage,
  feedViewKey,
  filteredFeedLength,
  invertedScrollAnchorIndex,
  isCollapseScrollRestoreActive,
  isInitialLoading,
  isInvertedScroll,
  refreshEpoch,
  searchTerm,
}: UseFeedListSurfaceStateOptions) {
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(null);
  const [visibleArticleCount, setVisibleArticleCount] = useState(articlesPerPage);
  const [viewportResolutionState, setViewportResolutionState] =
    useState<FeedViewportResolutionState>("pending");
  const hasUserScrolledRef = useRef(false);
  const isInvertedScrollRef = useRef(isInvertedScroll);
  isInvertedScrollRef.current = isInvertedScroll;
  const shouldLockNormalInitialScrollRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasResolvedInitialViewportRef = useRef(false);
  const previousFeedViewKeyRef = useRef(feedViewKey);
  const previousRefreshEpochRef = useRef(refreshEpoch);
  const previousIsInvertedRef = useRef(isInvertedScroll);
  const viewportHostRef = useRef<HTMLDivElement | null>(null);

  const handleViewportHostRef = useCallback((node: HTMLDivElement | null) => {
    viewportHostRef.current = node;
    queueMicrotask(() => {
      const resolvedViewport =
        node?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null;
      setScrollViewport(resolvedViewport);
      setViewportResolutionState(resolvedViewport ? "ready" : "missing");
    });
  }, []);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    setVisibleArticleCount(articlesPerPage);
  }, [articleFilter, articlesPerPage, feedViewKey, isInvertedScroll, refreshEpoch, searchTerm]);

  useLayoutEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const isInitialViewportResolution = !hasResolvedInitialViewportRef.current;
    const didFeedViewChange = previousFeedViewKeyRef.current !== feedViewKey;
    const didRefreshEpochChange = previousRefreshEpochRef.current !== refreshEpoch;
    const didInvertedChange = previousIsInvertedRef.current !== isInvertedScroll;
    hasResolvedInitialViewportRef.current = true;
    previousFeedViewKeyRef.current = feedViewKey;
    previousRefreshEpochRef.current = refreshEpoch;
    previousIsInvertedRef.current = isInvertedScroll;
    const isViewportReplacementDuringRestore =
      !didFeedViewChange && !didRefreshEpochChange && !didInvertedChange && isCollapseScrollRestoreActive;
    const shouldResetInitialViewportScroll =
      isInitialViewportResolution && !isCollapseScrollRestoreActive;

    if (isInvertedScroll) {
      /** Inverted scroll-to-bottom is driven by Virtuoso's totalListHeightChanged. */
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    if (
      isViewportReplacementDuringRestore ||
      (
        scrollViewport.scrollTop === 0 &&
        !shouldResetInitialViewportScroll &&
        !didFeedViewChange &&
        !didRefreshEpochChange &&
        !didInvertedChange
      )
    ) {
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    if (
      !didFeedViewChange &&
      !didRefreshEpochChange &&
      !didInvertedChange &&
      !shouldResetInitialViewportScroll
    ) {
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    shouldLockNormalInitialScrollRef.current = true;
    scrollViewport.scrollTop = 0;
  }, [feedViewKey, isCollapseScrollRestoreActive, isInvertedScroll, refreshEpoch, scrollViewport]);

  /**
   * Keep inverted mode anchored to the newest article until the reader starts
   * interacting. Once the user scrolls upward for older content, Virtuoso's
   * native prepend preservation takes over and we stop forcing a bottom snap.
   */
  const getInvertedScrollIntoViewLocation = useCallback(
    ({ totalCount }: { scrollingInProgress: boolean; totalCount: number }) => {
      if (
        !isInvertedScrollRef.current ||
        hasUserScrolledRef.current ||
        totalCount === 0
      ) {
        return false;
      }

      return {
        align: "end" as const,
        behavior: "auto" as const,
        index: invertedScrollAnchorIndex,
      };
    },
    [invertedScrollAnchorIndex],
  );

  /**
   * Continue following the newest item while inverted mode is still in its
   * initial reader-idle state. Once the reader scrolls, preserve position.
   */
  const getInvertedFollowOutput = useCallback(() => {
    if (!isInvertedScrollRef.current || hasUserScrolledRef.current) {
      return false;
    }

    return "auto" as const;
  }, []);

  /** Reports whether inverted mode still owns the viewport anchor. */
  const shouldAutoAnchorInvertedScroll = useCallback(() => {
    return isInvertedScrollRef.current && !hasUserScrolledRef.current;
  }, []);

  /** Reports whether normal mode should keep locking the viewport to the top. */
  const shouldLockInitialNormalScroll = useCallback(() => {
    return shouldLockNormalInitialScrollRef.current && !isInvertedScrollRef.current;
  }, []);

  const expandVisibleWindow = useCallback(() => {
    setVisibleArticleCount((currentCount) => {
      if (currentCount >= filteredFeedLength) {
        return currentCount;
      }

      return Math.min(currentCount + articlesPerPage, filteredFeedLength);
    });
  }, [articlesPerPage, filteredFeedLength]);

  const maybeLoadNextPage = useCallback(() => {
    if (!scrollViewport || visibleArticleCount >= filteredFeedLength) {
      return;
    }

    if (!hasUserScrolledRef.current) {
      return;
    }

    if (isInvertedScroll) {
      /** When inverted, older content is above the viewport — load when near the top. */
      if (
        Number.isFinite(scrollViewport.scrollTop) &&
        scrollViewport.scrollTop <= FEED_LOAD_MORE_THRESHOLD_PX
      ) {
        expandVisibleWindow();
      }
    } else {
      const remainingDistance =
        scrollViewport.scrollHeight -
        (scrollViewport.scrollTop + scrollViewport.clientHeight);

      if (
        Number.isFinite(remainingDistance) &&
        remainingDistance <= FEED_LOAD_MORE_THRESHOLD_PX
      ) {
        expandVisibleWindow();
      }
    }
  }, [expandVisibleWindow, filteredFeedLength, isInvertedScroll, scrollViewport, visibleArticleCount]);

  const shouldUseVirtualizedFeed =
    !isInitialLoading &&
    scrollViewport !== null;

  /** Expands the current page only when the measured viewport still cannot scroll. */
  const maybeAutoFillViewport = useCallback(() => {
    if (
      !scrollViewport ||
      isInitialLoading ||
      visibleArticleCount >= filteredFeedLength
    ) {
      return;
    }

    const scrollableOverflowPx =
      scrollViewport.scrollHeight - scrollViewport.clientHeight;

    if (
      Number.isFinite(scrollableOverflowPx) &&
      scrollableOverflowPx <= FEED_MIN_SCROLLABLE_OVERFLOW_PX
    ) {
      expandVisibleWindow();
    }
  }, [expandVisibleWindow, filteredFeedLength, isInitialLoading, scrollViewport, visibleArticleCount]);

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
  }, [filteredFeedLength, isInitialLoading, maybeAutoFillViewport, scrollViewport, shouldUseVirtualizedFeed, visibleArticleCount]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const handleScrollIntent = () => {
      if (!isInvertedScrollRef.current) {
        shouldLockNormalInitialScrollRef.current = false;
      }

      hasUserScrolledRef.current = true;
      maybeLoadNextPage();
    };

    const handleViewportScroll = () => {
      if (
        shouldLockNormalInitialScrollRef.current &&
        !isInvertedScrollRef.current
      ) {
        if (scrollViewport.scrollTop !== 0) {
          scrollViewport.scrollTop = 0;
          return;
        }

        return;
      }

      if (scrollViewport.scrollTop > 0 && !isInvertedScrollRef.current) {
        hasUserScrolledRef.current = true;
      }

      maybeLoadNextPage();
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
      scrollViewport.removeEventListener("scroll", handleViewportScroll);
      scrollViewport.removeEventListener("touchmove", handleScrollIntent);
      scrollViewport.removeEventListener("wheel", handleScrollIntent);
    };
  }, [maybeLoadNextPage, scrollViewport]);

  useEffect(() => {
    if (
      !scrollViewport ||
      typeof IntersectionObserver !== "function" ||
      visibleArticleCount >= filteredFeedLength
    ) {
      return;
    }

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) {
          return;
        }

        if (scrollViewport.scrollTop > 0 && !isInvertedScrollRef.current) {
          hasUserScrolledRef.current = true;
        }

        maybeLoadNextPage();
      },
      {
        root: scrollViewport,
        rootMargin: isInvertedScroll
          ? `${FEED_LOAD_MORE_THRESHOLD_PX}px 0px 0px 0px`
          : `0px 0px ${FEED_LOAD_MORE_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [filteredFeedLength, isInvertedScroll, maybeLoadNextPage, scrollViewport, visibleArticleCount]);

  const trimmedSearchTerm = searchTerm.trim();
  const hasSearchTerm = trimmedSearchTerm.length > 0;
  const hasMoreArticles = visibleArticleCount < filteredFeedLength;
  const shouldShowViewportResolutionSkeleton =
    !isInitialLoading && filteredFeedLength > 0 && viewportResolutionState === "pending";
  const showEmptyState = !isInitialLoading && filteredFeedLength === 0;

  const feedSurfaceMode: FeedSurfaceMode =
    isInitialLoading || shouldShowViewportResolutionSkeleton
      ? "skeleton"
      : showEmptyState
        ? "empty"
        : shouldUseVirtualizedFeed
          ? "virtualized"
          : "plain";

  const contentKey = isInitialLoading
    ? "feed-skeleton"
    : showEmptyState
      ? "feed-empty"
      : shouldShowViewportResolutionSkeleton
        ? "feed-viewport-skeleton"
        : "feed-content";

  const virtuosoComponents = useMemo(
    () => ({
      Footer: () =>
        hasMoreArticles ? (
          <div
            className="h-px w-full"
            data-feed-load-more-sentinel="true"
            ref={loadMoreSentinelRef}
          />
        ) : null,
      Item: forwardRef<HTMLDivElement, ComponentPropsWithRef<"div">>(
        function VirtuosoItem(props, ref) {
          return <div {...props} ref={ref} style={{ ...props.style, minHeight: 1 }} />;
        },
      ),
    }),
    [hasMoreArticles],
  );

  /**
   * Inverted variant that includes a `Header` sentinel (renders at the visual
   * top of the reversed list) plus the same `Item` wrapper. The `Footer` is
   * omitted because pagination expands upward via the header sentinel.
   */
  const invertedVirtuosoComponents = useMemo(
    () => ({
      Header: () =>
        hasMoreArticles ? (
          <div
            className="h-px w-full"
            data-feed-load-more-sentinel="true"
            ref={loadMoreSentinelRef}
          />
        ) : null,
      Item: forwardRef<HTMLDivElement, ComponentPropsWithRef<"div">>(
        function VirtuosoItem(props, ref) {
          return <div {...props} ref={ref} style={{ ...props.style, minHeight: 1 }} />;
        },
      ),
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
    [hasMoreArticles],
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
    shouldAutoAnchorInvertedScroll,
    shouldLockInitialNormalScroll,
    shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed,
    trimmedSearchTerm,
    virtuosoComponents,
    visibleArticleCount,
  };
}