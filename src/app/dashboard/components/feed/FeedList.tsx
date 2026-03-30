"use client";

/**
 * Renders the dashboard article feed inside the shared Radix ScrollArea.
 *
 * The feed now delegates viewport virtualization and dynamic-height handling to
 * react-virtuoso instead of managing manual paging, sentinels, FLIP reflow,
 * and scroll bookkeeping in-house. Feed rows stay visually idle so expand,
 * collapse, read, and filter updates resolve through plain layout changes.
 */

import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";

import { type Article, useIsMobile, useLocalStorage } from "@/lib";

import { MOBILE_INVERTED_SCROLL_STORAGE_KEY } from "../../constants";
import { type CollapsingArticles } from "../../hooks/useArticleCollapseState";
import { getArticleKey } from "../../services/article-collection";
import { FeedArticleRow } from "./FeedArticleRow";
import { FeedEmptyState } from "./FeedEmptyState";
import { type FeedListProps } from "./FeedList.types";
import { FeedListSkeleton, FeedLoadMoreSkeletonRows } from "./FeedListSkeleton";
import { useFeedListSurfaceState } from "./useFeedListSurfaceState";

const EMPTY_COLLAPSING_ARTICLES: Readonly<CollapsingArticles> = {};
const EMPTY_PRE_EXPAND_VIEWPORT_SNAPSHOT = () => null;

const FEED_DEFAULT_ITEM_HEIGHT_PX = 120;
const FEED_VIEWPORT_INCREASE = { bottom: 1500, top: 600 };
/** Swapped viewport overscan for inverted (bottom-to-top) scroll. */
const FEED_VIEWPORT_INCREASE_INVERTED = { bottom: 600, top: 1500 };
const FEED_VIEWPORT_INCREASE_INVERTED_INTERACTION = { bottom: 10_000, top: 10_000 };
/**
 * Large base index so Virtuoso can correctly handle prepend operations
 * when inverted pagination adds older articles to the top of the reversed list.
 */
const INVERTED_FIRST_INDEX_BASE = 100_000;

export function isFeedInvertedScrollActive(
  isMobile: boolean,
  mobileInvertedScroll: boolean,
) {
  return isMobile && mobileInvertedScroll;
}

export const FeedList = memo(function FeedList({
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
  const isActiveInvertedScroll = isFeedInvertedScrollActive(
    isMobile,
    mobileInvertedScroll,
  );
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? "dark") === "dark";
  const [measuredTotalListHeight, setMeasuredTotalListHeight] =
    useState<null | number>(null);
  /**
   * Ref kept in sync each render so the layout effect below can read the
   * scroll viewport's current scrollHeight without making it a reactive dep.
   */
  const scrollViewportRef = useRef<HTMLElement | null>(null);
  /**
   * Height floor that prevents the Virtuoso wrapper from shrinking during a
   * collapse transition. Captured synchronously in useLayoutEffect the moment
   * the collapse commit lands (before Virtuoso's async ResizeObserver fires).
   * Cleared on each new expansion so the list can grow freely.
   */
  const invertedHeightFloorRef = useRef<null | number>(null);
  const preExpandViewportSnapshotGetter =
    getPreExpandViewportSnapshot ?? EMPTY_PRE_EXPAND_VIEWPORT_SNAPSHOT;
  const {
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
    syncInvertedExpansionScrollLock,
    trimmedSearchTerm,
    virtuosoComponents,
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
    invertedScrollAnchorIndex: INVERTED_FIRST_INDEX_BASE - 1,
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

  /**
   * When inverted, reverse the feed so oldest articles sit at the top and
   * newest articles sit at the bottom. Combined with scroll-to-bottom on
   * mount, this gives the user newest-first with upward scroll for older.
   */
  const feedData = useMemo(
    () => (isActiveInvertedScroll ? [...visibleFeed].reverse() : visibleFeed),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleFeed identity changes every slice
    [isActiveInvertedScroll, visibleArticleCount, filteredFeed],
  );

  const invertedFirstItemIndex = isActiveInvertedScroll
    ? INVERTED_FIRST_INDEX_BASE - feedData.length
    : 0;

  scrollViewportRef.current = scrollViewport;

  /**
   * When an expanded article collapses, capture the current scrollHeight as
   * the floor before Virtuoso's ResizeObserver fires and reduces the list
   * height. Without the floor, the DOM shrinks → maxScrollTop drops →
   * the browser clamps the user's scrollTop, making "scroll down" impossible.
   * Reset the floor when a new article is expanded so the list can grow freely.
   */
  useLayoutEffect(() => {
    if (!isActiveInvertedScroll) {
      return;
    }

    if (expandedArticleKey !== null) {
      invertedHeightFloorRef.current = null;
      return;
    }

    const vp = scrollViewportRef.current;

    if (vp) {
      invertedHeightFloorRef.current = vp.scrollHeight;
    }
  // scrollViewport deliberately read from ref — not a reactive dep here.
   
  }, [expandedArticleKey, isActiveInvertedScroll]);

  /**
   * In inverted mode apply a height floor so the Virtuoso wrapper never
   * shrinks below the scrollHeight captured at collapse time. This prevents
   * scrollTop from being clamped by the browser as the DOM settles.
   */
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

    const floor = invertedHeightFloorRef.current ?? 0;

    return Math.max(baseHeight, floor);
  }, [isActiveInvertedScroll, measuredTotalListHeight, scrollViewport?.clientHeight]);
  const lastFeedArticle = feedData.at(-1);
  const lastFeedArticleKey = lastFeedArticle
    ? getArticleKey(lastFeedArticle)
    : null;

  const renderFeedRow = useCallback(
    (article: Article) => {
      const articleKey = getArticleKey(article);
      const removalAnimationMode = collapsingArticles[articleKey]?.mode ?? null;
      const isHydrating = hydratingArticleLinks[article.link] ?? false;
      const isUpdatingState = updatingArticleState[articleKey] ?? false;
      const useRichFormatting = hydratedArticleLinks[article.link] ?? false;

      return (
        <FeedArticleRow
          article={article}
          articleKey={articleKey}
          hasScrapedContent={Boolean(article.hasFullContent)}
          isDark={isDark}
          isExpanded={expandedArticleKey === articleKey}
          isHydrating={isHydrating}
          isLastRow={articleKey === lastFeedArticleKey}
          isMobile={isMobile}
          isUpdatingState={isUpdatingState}
          key={articleKey}
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
      collapsingArticles,
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isDark,
      lastFeedArticleKey,
      isMobile,
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

  const listFrameClassName = "flex h-full min-h-0 w-full min-w-0 flex-col";
  const listSurfaceClassName = "flex min-h-0 w-full min-w-0 flex-col";
  const listFillStyle = { height: "100%" } as const;
  const showEmptyState = !isInitialLoading && filteredFeed.length === 0;
  const skeletonExitTransition = {
    duration: 0.25,
    ease: [0.16, 1, 0.3, 1] as const,
  };
  const contentEnterTransition = {
    duration: 0.35,
    ease: [0.16, 1, 0.3, 1] as const,
  };
  const applyFeedSurfaceLayout = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }

    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.style.height = "100%";
    element.style.minHeight = "0";
  }, []);

  const applyFeedAncestorLayout = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }

    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.style.height = "auto";
    element.style.minHeight = "100%";
  }, []);

  const handleFeedSurfaceRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      applyFeedSurfaceLayout(node);

      if (isInvertedScroll) {
        applyFeedAncestorLayout(node.parentElement);
        applyFeedAncestorLayout(node.parentElement?.parentElement ?? null);
      } else {
        applyFeedSurfaceLayout(node.parentElement);
        applyFeedSurfaceLayout(node.parentElement?.parentElement ?? null);
      }
    }

    if (isInitialLoading || showEmptyState) {
      handleViewportHostRef(null);
      return;
    }

    handleViewportHostRef(node);
  }, [applyFeedAncestorLayout, applyFeedSurfaceLayout, handleViewportHostRef, isInitialLoading, isInvertedScroll, showEmptyState]);

  return (
    <div
      className={listSurfaceClassName}
      data-feed-surface-mode={feedSurfaceMode}
      data-feed-total-list-height={
        measuredTotalListHeight !== null
          ? `${Math.round(measuredTotalListHeight)}`
          : undefined
      }
      data-inverted-scroll={isInvertedScroll ? "true" : undefined}
      ref={handleFeedSurfaceRef}
      style={listFillStyle}
    >
      <AnimatePresence mode="wait">
        {isInitialLoading || shouldShowViewportResolutionSkeleton ? (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            exit={{ filter: "blur(4px)", opacity: 0, scale: 0.97 }}
            initial={{ opacity: 1, scale: 1 }}
            key={contentKey}
            transition={skeletonExitTransition}
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
            transition={contentEnterTransition}
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
            className={listFrameClassName}
            initial={{ opacity: 0, y: 6 }}
            key={contentKey}
            style={listFillStyle}
            transition={contentEnterTransition}
          >
            {shouldUseVirtualizedFeed ? (
              <Virtuoso
                className={listFrameClassName}
                components={isInvertedScroll ? invertedVirtuosoComponents : virtuosoComponents}
                computeItemKey={(index, article: Article | undefined) =>
                  article
                    ? getArticleKey(article)
                    : `${feedViewKey}:pending-item:${index}`
                }
                customScrollParent={scrollViewport ?? undefined}
                data={feedData}
                data-feed-virtualizer="true"
                defaultItemHeight={FEED_DEFAULT_ITEM_HEIGHT_PX}
                increaseViewportBy={
                  isInvertedScroll
                    ? expandedArticleKey !== null || isCollapseScrollRestoreActive
                      ? FEED_VIEWPORT_INCREASE_INVERTED_INTERACTION
                      : FEED_VIEWPORT_INCREASE_INVERTED
                    : FEED_VIEWPORT_INCREASE
                }
                initialItemCount={Math.min(feedData.length, visibleArticleCount)}
                itemContent={(_index, article: Article | undefined) =>
                  article ? renderFeedRow(article) : null
                }
                key={`${feedViewKey}:${isInvertedScroll ? "inv" : "std"}`}
                style={
                  isInvertedScroll && virtualizedListHeight !== null
                    ? { height: `${virtualizedListHeight}px` }
                    : listFillStyle
                }
                totalListHeightChanged={(nextTotalListHeight) => {
                  setMeasuredTotalListHeight(nextTotalListHeight);

                  if (isInvertedScroll) {
                    syncInvertedExpansionScrollLock();

                    if (shouldAutoAnchorInvertedScroll()) {
                      scrollViewport?.scrollTo({
                        behavior: "auto",
                        top: scrollViewport.scrollHeight,
                      });
                    }
                  } else if (shouldLockInitialNormalScroll()) {
                    scrollViewport?.scrollTo({
                      behavior: "auto",
                      top: 0,
                    });
                  }

                  maybeAutoFillViewport();
                }}
                {...(isInvertedScroll
                  ? {
                      alignToBottom: shouldAutoAnchorInvertedScroll(),
                      firstItemIndex: invertedFirstItemIndex,
                      followOutput: getInvertedFollowOutput,
                      initialTopMostItemIndex: {
                        align: "end" as const,
                        index: INVERTED_FIRST_INDEX_BASE - 1,
                      },
                      scrollIntoViewOnChange: getInvertedScrollIntoViewLocation,
                    }
                  : {})}
              />
            ) : (
              <>
                {isInvertedScroll && shouldShowLoadMoreBoundary ? (
                  <div
                    className="h-px w-full"
                    data-feed-load-more-sentinel="true"
                    ref={loadMoreSentinelRef}
                  />
                ) : null}
                {isInvertedScroll && !hasMoreArticles && isLoadingMore ? (
                  <div data-feed-load-more-skeletons="true">
                    <FeedLoadMoreSkeletonRows count={articlesPerPage} />
                  </div>
                ) : null}
                {feedData.map(renderFeedRow)}
                {!isInvertedScroll && !hasMoreArticles && isLoadingMore ? (
                  <div data-feed-load-more-skeletons="true">
                    <FeedLoadMoreSkeletonRows count={articlesPerPage} />
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
