"use client";

/**
 * Renders the dashboard article feed inside the shared Radix ScrollArea.
 *
 * The feed delegates row windowing and dynamic-height measurement to a
 * feed-owned TanStack Virtual surface instead of manual paging, sentinels,
 * FLIP reflow, or library-managed scroll containers. Feed rows stay visually
 * idle so expand, collapse, read, and filter updates resolve through plain
 * layout changes.
 */

import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type Article, useIsMobile, useLocalStorage } from "@/lib";

import { MOBILE_INVERTED_SCROLL_STORAGE_KEY } from "../../constants";
import { type CollapsingArticles } from "../../hooks/useArticleCollapseState";
import { getArticleKey } from "../../services/article-collection";
import {
  isInvertedFeedScrollMode,
  resolveFeedScrollMode,
  resolveFeedScrollModeArticles,
} from "./feed-list-surface-state/feed-scroll-mode";
import { syncViewportToBottomIfNeeded } from "./feed-list-surface-state/viewport-scroll";
import { FeedArticleRow } from "./FeedArticleRow";
import { FeedEmptyState } from "./FeedEmptyState";
import { type FeedListProps } from "./FeedList.types";
import { FeedListSkeleton, FeedLoadMoreSkeletonRows } from "./FeedListSkeleton";
import { FeedVirtualList } from "./FeedVirtualList";
import { useFeedListSurfaceState } from "./useFeedListSurfaceState";

const EMPTY_COLLAPSING_ARTICLES: Readonly<CollapsingArticles> = {};
const EMPTY_PRE_EXPAND_VIEWPORT_SNAPSHOT = () => null;

const FEED_DEFAULT_ITEM_HEIGHT_PX = 120;

/** Shared class string for the virtualized feed wrapper and list frame elements. */
const FEED_LIST_FRAME_CLASSNAME = "flex h-full min-h-0 w-full min-w-0 flex-col";
/** Class string for the outermost surface container. */
const FEED_LIST_SURFACE_CLASSNAME = "flex min-h-0 w-full min-w-0 flex-col";
/** Inline style forcing the surface and its children to fill the available height. */
const FEED_LIST_FILL_STYLE = { height: "100%" } as const;
/** Motion transition applied when the skeleton exits. */
const SKELETON_EXIT_TRANSITION = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1] as const,
};
/** Motion transition applied when real content enters. */
const CONTENT_ENTER_TRANSITION = {
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1] as const,
};

function syncViewportScrollTop(viewport: HTMLElement, top: number) {
  if (typeof viewport.scrollTo === "function") {
    viewport.scrollTo({
      behavior: "auto",
      top,
    });
  }

  if (Math.abs(viewport.scrollTop - top) > 1) {
    viewport.scrollTop = top;
  }
}

export const FeedList = memo(function FeedList({
  animatingInArticleKeys,
  articleFilter,
  articlesPerPage,
  collapsingArticles = EMPTY_COLLAPSING_ARTICLES,
  expandedArticleKey,
  feedViewKey,
  filteredFeed,
  getPreExpandViewportSnapshot,
  hasConfiguredFeeds,
  hydratedArticleLinks,
  hydratingArticleLinks,
  isCollapseScrollRestoreActive = false,
  isInitialLoading,
  isLoadingMore = false,
  isRefreshing: _isRefreshing,
  loadingMoreArticleCount,
  onEnteringDone,
  onExpandedSwipeRead,
  onLoadMore,
  onPrepareExpand,
  onSwipeRead,
  onToggle,
  onToggleRead,
  onToggleStarred,
  refreshEpoch = 0,
  searchTerm,
  showFavicons,
  updatingArticleState,
}: FeedListProps) {
  const isMobile = useIsMobile();
  const [mobileInvertedScroll] = useLocalStorage(
    MOBILE_INVERTED_SCROLL_STORAGE_KEY,
    true,
  );
  const feedScrollMode = resolveFeedScrollMode(
    isMobile,
    mobileInvertedScroll,
  );
  const isActiveInvertedScroll = isInvertedFeedScrollMode(feedScrollMode);
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? "dark") === "dark";
  const isMountedRef = useRef(true);
  const [measuredTotalListHeight, setMeasuredTotalListHeight] =
    useState<null | number>(null);
  const scrollViewportRef = useRef<HTMLElement | null>(null);
  const invertedHeightFloorRef = useRef<null | number>(null);
  const invertedHydrationAnchorFrameRef = useRef<null | number>(null);
  const previousExpandedArticleKeyRef = useRef(expandedArticleKey);
  const preExpandViewportSnapshotGetter =
    getPreExpandViewportSnapshot ?? EMPTY_PRE_EXPAND_VIEWPORT_SNAPSHOT;
  const {
    contentKey,
    feedSurfaceMode,
    handleViewportHostRef,
    hasMoreArticles,
    hasSearchTerm,
    invertedPaginationAnchorRef,
    isInvertedScroll,
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
    shouldLockInitialNormalScroll,
    shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed,
    syncInvertedExpansionScrollLock,
    syncInvertedPaginationAnchor,
    trimmedSearchTerm,
    visibleArticleCount,
  } = useFeedListSurfaceState({
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer: typeof onLoadMore === "function",
    collapsingArticles,
    expandedArticleKey,
    feedViewKey,
    filteredFeedLength: filteredFeed.length,
    getPreExpandViewportSnapshot: preExpandViewportSnapshotGetter,
    invertedScrollAnchorIndex: 0,
    isCollapseScrollRestoreActive,
    isInitialLoading,
    isInvertedScroll: isActiveInvertedScroll,
    isLoadingMore,
    onLoadMore,
    refreshEpoch,
    searchTerm,
  });

  const visibleFeed = filteredFeed.slice(0, visibleArticleCount);
  const shouldShowLoadMoreBoundary = hasMoreArticles || typeof onLoadMore === "function";
  const loadMoreSkeletonCount = Math.max(
    0,
    loadingMoreArticleCount ?? articlesPerPage,
  );

  const feedData = useMemo(
    () => resolveFeedScrollModeArticles(visibleFeed, feedScrollMode),
    [feedScrollMode, visibleFeed],
  );

  scrollViewportRef.current = scrollViewport;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      if (invertedHydrationAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(invertedHydrationAnchorFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    invertedHeightFloorRef.current = null;
  }, [articleFilter, feedViewKey, isActiveInvertedScroll, searchTerm]);

  useLayoutEffect(() => {
    const previousExpandedArticleKey = previousExpandedArticleKeyRef.current;
    previousExpandedArticleKeyRef.current = expandedArticleKey;

    if (!isActiveInvertedScroll) {
      return;
    }

    if (expandedArticleKey !== null) {
      invertedHeightFloorRef.current = null;
      return;
    }

    if (previousExpandedArticleKey === null) {
      return;
    }

    const viewport = scrollViewportRef.current;

    if (viewport && viewport.scrollHeight > (invertedHeightFloorRef.current ?? 0)) {
      invertedHeightFloorRef.current = viewport.scrollHeight;
    }
  }, [expandedArticleKey, isActiveInvertedScroll]);

  const prevCollapsingArticleCountRef = useRef(Object.keys(collapsingArticles).length);
  useLayoutEffect(() => {
    if (!isActiveInvertedScroll || expandedArticleKey !== null) {
      return;
    }

    const previousCount = prevCollapsingArticleCountRef.current;
    const currentCount = Object.keys(collapsingArticles).length;
    prevCollapsingArticleCountRef.current = currentCount;

    if (currentCount > 0 && previousCount === 0) {
      const viewport = scrollViewportRef.current;

      if (viewport && viewport.scrollHeight > (invertedHeightFloorRef.current ?? 0)) {
        invertedHeightFloorRef.current = viewport.scrollHeight;
      }
    }
  }, [collapsingArticles, expandedArticleKey, isActiveInvertedScroll]);

  const virtualizedListHeight = useMemo(() => {
    if (measuredTotalListHeight === null) {
      return null;
    }

    const baseHeight = Math.max(
      Math.ceil(measuredTotalListHeight),
      scrollViewport?.clientHeight ?? 0,
    );

    if (!isActiveInvertedScroll) {
      return baseHeight;
    }

    return Math.max(baseHeight, invertedHeightFloorRef.current ?? 0);
  }, [isActiveInvertedScroll, measuredTotalListHeight, scrollViewport?.clientHeight]);
  const lastFeedArticle = feedData.at(-1);
  const lastFeedArticleKey = lastFeedArticle
    ? getArticleKey(lastFeedArticle)
    : null;

  useLayoutEffect(() => {
    if (
      !isInvertedScroll ||
      scrollViewport === null ||
      virtualizedListHeight === null ||
      !shouldAutoAnchorInvertedScroll()
    ) {
      return;
    }

    syncViewportToBottomIfNeeded(scrollViewport);
  }, [
    isInvertedScroll,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
    virtualizedListHeight,
  ]);

  useLayoutEffect(() => {
    if (
      !isInvertedScroll ||
      scrollViewport === null ||
      !shouldAutoAnchorInvertedScroll() ||
      feedData.length === 0
    ) {
      if (invertedHydrationAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(invertedHydrationAnchorFrameRef.current);
        invertedHydrationAnchorFrameRef.current = null;
      }

      return;
    }

    if (syncViewportToBottomIfNeeded(scrollViewport)) {
      return;
    }

    invertedHydrationAnchorFrameRef.current = window.requestAnimationFrame(() => {
      invertedHydrationAnchorFrameRef.current = null;
      syncViewportToBottomIfNeeded(scrollViewport);
    });

    return () => {
      if (invertedHydrationAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(invertedHydrationAnchorFrameRef.current);
        invertedHydrationAnchorFrameRef.current = null;
      }
    };
  }, [feedData.length, isInvertedScroll, scrollViewport, shouldAutoAnchorInvertedScroll]);

  const renderFeedRow = useCallback(
    (article: Article) => {
      const articleKey = getArticleKey(article);
      const removalAnimationMode = collapsingArticles[articleKey]?.mode ?? null;
      const isHydrating = hydratingArticleLinks[article.link] ?? false;
      const isUpdatingState = updatingArticleState[articleKey] ?? false;
      const useRichFormatting = hydratedArticleLinks[article.link] ?? false;
      const isEntering = animatingInArticleKeys?.has(articleKey) ?? false;

      return (
        <FeedArticleRow
          article={article}
          articleKey={articleKey}
          hasScrapedContent={Boolean(article.hasFullContent)}
          isDark={isDark}
          isEntering={isEntering}
          isExpanded={expandedArticleKey === articleKey}
          isHydrating={isHydrating}
          isLastRow={articleKey === lastFeedArticleKey}
          isMobile={isMobile}
          isUpdatingState={isUpdatingState}
          key={articleKey}
          onEnteringDone={onEnteringDone}
          onExpandedSwipeRead={onExpandedSwipeRead}
          onPrepareExpand={onPrepareExpand}
          onSwipeRead={onSwipeRead}
          onToggle={onToggle}
          onToggleRead={onToggleRead}
          onToggleStarred={onToggleStarred}
          removalAnimationMode={removalAnimationMode}
          showFavicons={showFavicons}
          useRichFormatting={useRichFormatting}
        />
      );
    },
    [
      animatingInArticleKeys,
      collapsingArticles,
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isDark,
      lastFeedArticleKey,
      isMobile,
      onEnteringDone,
      onExpandedSwipeRead,
      onPrepareExpand,
      onSwipeRead,
      onToggle,
      onToggleRead,
      onToggleStarred,
      showFavicons,
      updatingArticleState,
    ],
  );

  const showEmptyState = !isInitialLoading && filteredFeed.length === 0;
  const applyFeedSurfaceLayout = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }

    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.style.height = "100%";
    element.style.minHeight = "0";
  }, []);

  const handleFeedSurfaceRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      applyFeedSurfaceLayout(node);
      applyFeedSurfaceLayout(node.parentElement);
      applyFeedSurfaceLayout(node.parentElement?.parentElement ?? null);
    }

    if (isInitialLoading || showEmptyState) {
      handleViewportHostRef(null);
      return;
    }

    handleViewportHostRef(node);
  }, [applyFeedSurfaceLayout, handleViewportHostRef, isInitialLoading, showEmptyState]);

  return (
    <div
      className={FEED_LIST_SURFACE_CLASSNAME}
      data-feed-surface-mode={feedSurfaceMode}
      data-feed-total-list-height={
        measuredTotalListHeight !== null
          ? `${Math.round(measuredTotalListHeight)}`
          : undefined
      }
      data-inverted-scroll={isInvertedScroll ? "true" : undefined}
      ref={handleFeedSurfaceRef}
      style={FEED_LIST_FILL_STYLE}
    >
      <AnimatePresence mode="wait">
        {isInitialLoading || shouldShowViewportResolutionSkeleton ? (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            exit={{ filter: "blur(4px)", opacity: 0, scale: 0.97 }}
            initial={{ opacity: 1, scale: 1 }}
            key={contentKey}
            transition={SKELETON_EXIT_TRANSITION}
          >
            <FeedListSkeleton />
          </motion.div>
        ) : showEmptyState ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="
              flex min-h-[clamp(20rem,calc(100dvh-12rem),34rem)] w-full
              items-center justify-center px-1 py-3
              sm:px-4 sm:py-6
            "
            data-feed-empty-state-frame="true"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            key={contentKey}
            transition={CONTENT_ENTER_TRANSITION}
          >
            <FeedEmptyState
              articleFilter={articleFilter}
              hasConfiguredFeeds={hasConfiguredFeeds}
              hasSearchTerm={hasSearchTerm}
              trimmedSearchTerm={trimmedSearchTerm}
            />
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={FEED_LIST_FRAME_CLASSNAME}
            initial={{ opacity: 0, y: 6 }}
            key={contentKey}
            style={FEED_LIST_FILL_STYLE}
            transition={CONTENT_ENTER_TRANSITION}
          >
            {shouldUseVirtualizedFeed && scrollViewport !== null ? (
              <>
                {/*
                 * Skeleton rows for the next server page live OUTSIDE the
                 * virtualized content tree so they appear via normal React
                 * reconciliation the moment isLoadingMore becomes true.
                 *
                 * Keeping them outside the measured row window avoids coupling the
                 * loading placeholder to row measurement and ensures the skeletons
                 * paint immediately during the server round trip.
                 *
                 * Inverted mode: skeletons appear at the top (older articles load upward).
                 * Standard mode: skeletons appear at the bottom (newer pages append downward).
                 * The IntersectionObserver sentinel stays inside the virtualizer so
                 * it fires at the correct virtual position.
                 */}
                {isInvertedScroll && isLoadingMore && loadMoreSkeletonCount > 0 ? (
                  <div data-feed-load-more-skeletons="true">
                    <FeedLoadMoreSkeletonRows count={loadMoreSkeletonCount} />
                  </div>
                ) : null}
                <FeedVirtualList
                  articles={feedData}
                  className={FEED_LIST_FRAME_CLASSNAME}
                  estimatedItemHeight={FEED_DEFAULT_ITEM_HEIGHT_PX}
                  expandedArticleKey={expandedArticleKey}
                  feedViewKey={feedViewKey}
                  isCollapseScrollRestoreActive={isCollapseScrollRestoreActive}
                  key={`${feedViewKey}:${isInvertedScroll ? "inv" : "std"}`}
                  loadMoreSentinelRef={loadMoreSentinelRef}
                  minimumTotalListHeight={
                    isInvertedScroll ? virtualizedListHeight ?? undefined : undefined
                  }
                  onTotalListHeightChange={(nextTotalListHeight) => {
                    if (!isMountedRef.current) {
                      return;
                    }

                    const viewport = scrollViewportRef.current;
                    const shouldAutoAnchorViewport =
                      isInvertedScroll && shouldAutoAnchorInvertedScroll();

                    if (isInvertedScroll && viewport) {
                      const minimumViewportFloor = viewport.scrollTop + viewport.clientHeight;

                      if (invertedPaginationAnchorRef.current !== null) {
                        invertedHeightFloorRef.current = Math.max(
                          invertedHeightFloorRef.current ?? 0,
                          nextTotalListHeight,
                          minimumViewportFloor,
                        );
                      } else if (!shouldAutoAnchorViewport) {
                        invertedHeightFloorRef.current = Math.max(
                          nextTotalListHeight,
                          minimumViewportFloor,
                        );
                      } else {
                        invertedHeightFloorRef.current = null;
                      }
                    }

                    setMeasuredTotalListHeight((currentHeight) =>
                      currentHeight === nextTotalListHeight
                        ? currentHeight
                        : nextTotalListHeight,
                    );

                    if (isInvertedScroll) {
                      syncInvertedExpansionScrollLock();
                      syncInvertedPaginationAnchor();

                      if (shouldAutoAnchorViewport) {
                        syncViewportToBottomIfNeeded(scrollViewport);
                      }
                    } else if (shouldLockInitialNormalScroll()) {
                      syncViewportScrollTop(scrollViewport, 0);
                    }

                    maybeAutoFillViewport(
                      Math.max(
                        nextTotalListHeight,
                        invertedHeightFloorRef.current ?? 0,
                      ),
                    );
                  }}
                  renderArticle={renderFeedRow}
                  scrollMode={feedScrollMode}
                  scrollViewport={scrollViewport}
                  showLoadMoreBoundary={shouldShowLoadMoreBoundary}
                />
                {!isInvertedScroll && isLoadingMore && loadMoreSkeletonCount > 0 ? (
                  <div data-feed-load-more-skeletons="true">
                    <FeedLoadMoreSkeletonRows count={loadMoreSkeletonCount} />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {isInvertedScroll && shouldShowLoadMoreBoundary ? (
                  <div
                    className="h-px w-full"
                    data-feed-load-more-sentinel="true"
                    ref={loadMoreSentinelRef}
                  />
                ) : null}
                {isInvertedScroll && !hasMoreArticles && isLoadingMore && loadMoreSkeletonCount > 0 ? (
                  <div data-feed-load-more-skeletons="true">
                    <FeedLoadMoreSkeletonRows count={loadMoreSkeletonCount} />
                  </div>
                ) : null}
                {feedData.map(renderFeedRow)}
                {!isInvertedScroll && !hasMoreArticles && isLoadingMore && loadMoreSkeletonCount > 0 ? (
                  <div data-feed-load-more-skeletons="true">
                    <FeedLoadMoreSkeletonRows count={loadMoreSkeletonCount} />
                  </div>
                ) : null}
                {!isInvertedScroll && shouldShowLoadMoreBoundary ? (
                  <div
                    className="h-px w-full"
                    data-feed-load-more-sentinel="true"
                    ref={loadMoreSentinelRef}
                  />
                ) : null}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
