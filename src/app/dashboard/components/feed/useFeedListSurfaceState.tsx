import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  isCollapseScrollRestoreActive: boolean;
  isInitialLoading: boolean;
  searchTerm: string;
}

export function useFeedListSurfaceState({
  articleFilter,
  articlesPerPage,
  feedViewKey,
  filteredFeedLength,
  isCollapseScrollRestoreActive,
  isInitialLoading,
  searchTerm,
}: UseFeedListSurfaceStateOptions) {
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(null);
  const [visibleArticleCount, setVisibleArticleCount] = useState(articlesPerPage);
  const [viewportResolutionState, setViewportResolutionState] =
    useState<FeedViewportResolutionState>("pending");
  const hasUserScrolledRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const previousFeedViewKeyRef = useRef(feedViewKey);
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
  }, [articleFilter, articlesPerPage, feedViewKey, searchTerm]);

  useLayoutEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const didFeedViewChange = previousFeedViewKeyRef.current !== feedViewKey;
    previousFeedViewKeyRef.current = feedViewKey;
    const isViewportReplacementDuringRestore =
      !didFeedViewChange && isCollapseScrollRestoreActive;

    if (isViewportReplacementDuringRestore || scrollViewport.scrollTop === 0) {
      return;
    }

    if (!didFeedViewChange) {
      return;
    }

    scrollViewport.scrollTop = 0;
  }, [feedViewKey, isCollapseScrollRestoreActive, scrollViewport]);

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

    const remainingDistance =
      scrollViewport.scrollHeight -
      (scrollViewport.scrollTop + scrollViewport.clientHeight);

    if (
      hasUserScrolledRef.current &&
      Number.isFinite(remainingDistance) &&
      remainingDistance <= FEED_LOAD_MORE_THRESHOLD_PX
    ) {
      expandVisibleWindow();
    }
  }, [expandVisibleWindow, filteredFeedLength, scrollViewport, visibleArticleCount]);

  useEffect(() => {
    if (
      !scrollViewport ||
      isInitialLoading ||
      visibleArticleCount >= filteredFeedLength
    ) {
      return;
    }

    const autoFillFrameId = requestAnimationFrame(() => {
      const scrollableOverflowPx =
        scrollViewport.scrollHeight - scrollViewport.clientHeight;

      if (
        Number.isFinite(scrollableOverflowPx) &&
        scrollableOverflowPx <= FEED_MIN_SCROLLABLE_OVERFLOW_PX
      ) {
        expandVisibleWindow();
      }
    });

    return () => {
      cancelAnimationFrame(autoFillFrameId);
    };
  }, [expandVisibleWindow, filteredFeedLength, isInitialLoading, scrollViewport, visibleArticleCount]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const handleScrollIntent = () => {
      hasUserScrolledRef.current = true;
      maybeLoadNextPage();
    };

    const handleViewportScroll = () => {
      if (scrollViewport.scrollTop > 0) {
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

        if (scrollViewport.scrollTop > 0) {
          hasUserScrolledRef.current = true;
        }

        maybeLoadNextPage();
      },
      {
        root: scrollViewport,
        rootMargin: `0px 0px ${FEED_LOAD_MORE_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [filteredFeedLength, maybeLoadNextPage, scrollViewport, visibleArticleCount]);

  const trimmedSearchTerm = searchTerm.trim();
  const hasSearchTerm = trimmedSearchTerm.length > 0;
  const hasMoreArticles = visibleArticleCount < filteredFeedLength;
  const shouldShowViewportResolutionSkeleton =
    !isInitialLoading && filteredFeedLength > 0 && viewportResolutionState === "pending";
  const shouldUseVirtualizedFeed =
    !isInitialLoading &&
    scrollViewport !== null;
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
    }),
    [hasMoreArticles],
  );

  return {
    contentKey,
    feedSurfaceMode,
    handleViewportHostRef,
    hasMoreArticles,
    hasSearchTerm,
    loadMoreSentinelRef,
    scrollViewport,
    shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed,
    trimmedSearchTerm,
    virtuosoComponents,
    visibleArticleCount,
  };
}