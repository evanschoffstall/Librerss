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
import { memo, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";

import { type Article } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

import { getArticleKey } from "../../services/article-collection";
import { FeedArticleRow } from "./FeedArticleRow";
import { FeedEmptyState } from "./FeedEmptyState";
import { type FeedListProps } from "./FeedList.types";
import { FeedListSkeleton } from "./FeedListSkeleton";
import { useFeedListSurfaceState } from "./useFeedListSurfaceState";

const FEED_DEFAULT_ITEM_HEIGHT_PX = 120;
const FEED_VIEWPORT_INCREASE = { bottom: 1500, top: 600 };

export const FeedList = memo(function FeedList({
  articleFilter,
  articlesPerPage,
  collapsingArticles = {},
  expandedArticleKey,
  feedViewKey,
  filteredFeed,
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
  searchTerm,
  showFavicons,
  updatingArticleState,
}: FeedListProps) {
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? "dark") === "dark";
  const {
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
  } = useFeedListSurfaceState({
    articleFilter,
    articlesPerPage,
    expandedArticleKey,
    feedViewKey,
    filteredFeedLength: filteredFeed.length,
    isCollapseScrollRestoreActive,
    isInitialLoading,
    searchTerm,
  });

  const visibleFeed = filteredFeed.slice(0, visibleArticleCount);

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
              hasSearchTerm={hasSearchTerm}
              trimmedSearchTerm={trimmedSearchTerm}
            />
          </motion.div>
        ) : shouldUseVirtualizedFeed ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={listClassName}
            initial={{ opacity: 0, y: 6 }}
            key={contentKey}
            transition={contentEnterTransition}
          >
            <Virtuoso
              className={listClassName}
              components={virtuosoComponents}
              computeItemKey={(index, article: Article | undefined) =>
                article
                  ? getArticleKey(article)
                  : `${feedViewKey}:pending-item:${index}`
              }
              customScrollParent={scrollViewport ?? undefined}
              data={visibleFeed}
              data-feed-virtualizer="true"
              defaultItemHeight={FEED_DEFAULT_ITEM_HEIGHT_PX}
              increaseViewportBy={FEED_VIEWPORT_INCREASE}
              initialItemCount={Math.min(visibleFeed.length, 20)}
              itemContent={(_index, article: Article | undefined) =>
                article ? renderFeedRow(article) : null
              }
              key={feedViewKey}
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
            {visibleFeed.map(renderFeedRow)}
            {hasMoreArticles ? (
              <div
                className="h-px w-full"
                data-feed-load-more-sentinel="true"
                ref={loadMoreSentinelRef}
              />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
