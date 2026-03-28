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
import { memo, useCallback, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";

import { type Article } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";

import { MOBILE_INVERTED_SCROLL_STORAGE_KEY } from "../../constants";
import { type CollapsingArticles } from "../../hooks/useArticleCollapseState";
import { getArticleKey } from "../../services/article-collection";
import { FeedArticleRow } from "./FeedArticleRow";
import { FeedEmptyState } from "./FeedEmptyState";
import { type FeedListProps } from "./FeedList.types";
import { FeedListSkeleton } from "./FeedListSkeleton";
import { useFeedListSurfaceState } from "./useFeedListSurfaceState";

const EMPTY_COLLAPSING_ARTICLES: Readonly<CollapsingArticles> = {};

const FEED_DEFAULT_ITEM_HEIGHT_PX = 120;
const FEED_VIEWPORT_INCREASE = { bottom: 1500, top: 600 };
/** Swapped viewport overscan for inverted (bottom-to-top) scroll. */
const FEED_VIEWPORT_INCREASE_INVERTED = { bottom: 600, top: 1500 };
/**
 * Large base index so Virtuoso can correctly handle prepend operations
 * when inverted pagination adds older articles to the top of the reversed list.
 */
const INVERTED_FIRST_INDEX_BASE = 100_000;

export const FeedList = memo(function FeedList({
  articleFilter,
  articlesPerPage,
  collapsingArticles = EMPTY_COLLAPSING_ARTICLES,
  expandedArticleKey,
  feedViewKey,
  filteredFeed,
  hasConfiguredFeeds,
  hydratedArticleLinks,
  hydratingArticleLinks,
  isCollapseScrollRestoreActive = false,
  isInitialLoading,
  isRefreshing: _isRefreshing,
  onExpandedSwipeRead,
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
  const isActiveInvertedScroll = isMobile && mobileInvertedScroll;
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? "dark") === "dark";
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
    trimmedSearchTerm,
    virtuosoComponents,
    visibleArticleCount,
  } = useFeedListSurfaceState({
    articleFilter,
    articlesPerPage,
    expandedArticleKey,
    feedViewKey,
    filteredFeedLength: filteredFeed.length,
    invertedScrollAnchorIndex: INVERTED_FIRST_INDEX_BASE - 1,
    isCollapseScrollRestoreActive,
    isInitialLoading,
    isInvertedScroll: isActiveInvertedScroll,
    refreshEpoch,
    searchTerm,
  });

  const visibleFeed = filteredFeed.slice(0, visibleArticleCount);

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
  const lastFeedArticleKey = feedData.at(-1)
    ? getArticleKey(feedData.at(-1)!)
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

  const listClassName = "w-full min-w-0";
  const showEmptyState = !isInitialLoading && filteredFeed.length === 0;
  const skeletonExitTransition = {
    duration: 0.25,
    ease: [0.16, 1, 0.3, 1] as const,
  };
  const contentEnterTransition = {
    duration: 0.35,
    ease: [0.16, 1, 0.3, 1] as const,
  };

  return (
    <div
      className={listClassName}
      data-feed-surface-mode={feedSurfaceMode}
      data-inverted-scroll={isInvertedScroll ? "true" : undefined}
      ref={isInitialLoading || showEmptyState ? undefined : handleViewportHostRef}
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
            className={listClassName}
            initial={{ opacity: 0, y: 6 }}
            key={contentKey}
            transition={contentEnterTransition}
          >
            {shouldUseVirtualizedFeed ? (
              <Virtuoso
                className={listClassName}
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
                    ? FEED_VIEWPORT_INCREASE_INVERTED
                    : FEED_VIEWPORT_INCREASE
                }
                initialItemCount={Math.min(feedData.length, 20)}
                itemContent={(_index, article: Article | undefined) =>
                  article ? renderFeedRow(article) : null
                }
                key={`${feedViewKey}:${isInvertedScroll ? "inv" : "std"}`}
                totalListHeightChanged={() => {
                  if (isInvertedScroll) {
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
                      alignToBottom: true,
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
                {isInvertedScroll && hasMoreArticles ? (
                  <div
                    className="h-px w-full"
                    data-feed-load-more-sentinel="true"
                    ref={loadMoreSentinelRef}
                  />
                ) : null}
                {feedData.map(renderFeedRow)}
                {!isInvertedScroll && hasMoreArticles ? (
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
