import type { ReactElement } from "react";

import { AnimatePresence, motion } from "motion/react";

import {
  type FeedScrollMode,
  type FeedSurfaceMode,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/view-core";
import { FeedEmptyState } from "@/app/dashboard/components/feed-view/FeedEmptyState";
import { type FeedListProps } from "@/app/dashboard/components/feed-view/FeedList.types";
import {
  FeedListConfig,
  FeedListSkeleton,
  FeedLoadMoreSkeletonBlock,
} from "@/app/dashboard/components/feed-view/FeedListComposition";
import { FeedVirtualList } from "@/app/dashboard/components/feed-view/FeedVirtualList";

/** Props used to render the feed surface body extracted from FeedList. */
export interface FeedListBodyProps {
  articleFilter: FeedListProps["articleFilter"];
  contentKey: string;
  expandedArticleKey: FeedListProps["expandedArticleKey"];
  feedData: FeedArticle[];
  feedScrollMode: FeedScrollMode;
  feedSurfaceMode: FeedSurfaceMode;
  feedViewKey: FeedListProps["feedViewKey"];
  handleFeedSurfaceRef: (node: HTMLDivElement | null) => void;
  handleTotalListHeightChange: (nextHeight: number) => void;
  hasConfiguredFeeds?: boolean;
  hasSearchTerm: boolean;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  loadMoreSkeletonCount: number;
  measuredTotalListHeight: null | number;
  renderFeedRow: (article: FeedArticle) => ReactElement;
  scrollViewport: HTMLElement | null;
  shouldShowFeedSkeleton: boolean;
  shouldShowLoadMoreBoundary: boolean;
  shouldShowLoadMoreSkeletons: boolean;
  shouldUseVirtualizedFeedSurface: boolean;
  showEmptyState: boolean;
  trimmedSearchTerm: string;
  virtualizedListHeight: null | number;
  visibleArticleCount: number;
}

/** Describes one rendered feed article. */
type FeedArticle = FeedListProps["filteredFeed"][number];

/** Props for the feed empty-state frame. */
interface FeedListEmptyStateFrameProps {
  articleFilter: FeedListProps["articleFilter"];
  contentKey: string;
  hasConfiguredFeeds?: boolean;
  hasSearchTerm: boolean;
  trimmedSearchTerm: string;
}

/** Props for the feed skeleton frame. */
interface FeedListSkeletonFrameProps {
  contentKey: string;
  isInvertedScroll: boolean;
}

/**
 * Render the feed surface body for skeleton, empty, and populated states.
 * @param props - Feed surface state and render callbacks.
 * @returns The rendered feed surface body.
 */
export function FeedListBody(props: FeedListBodyProps) {
  const {
    articleFilter,
    contentKey,
    feedData,
    feedSurfaceMode,
    handleFeedSurfaceRef,
    hasConfiguredFeeds,
    hasSearchTerm,
    isInvertedScroll,
    loadMoreSkeletonCount,
    measuredTotalListHeight,
    shouldShowFeedSkeleton,
    shouldShowLoadMoreSkeletons,
    showEmptyState,
    trimmedSearchTerm,
    visibleArticleCount,
  } = props;

  return (
    <div
      className={FeedListConfig.FEED_LIST_SURFACE_CLASSNAME}
      data-feed-load-more-skeleton-count={
        shouldShowLoadMoreSkeletons && loadMoreSkeletonCount > 0
          ? loadMoreSkeletonCount
          : undefined
      }
      data-feed-load-more-skeletons-visible={
        shouldShowLoadMoreSkeletons && loadMoreSkeletonCount > 0
          ? "true"
          : undefined
      }
      data-feed-rendered-article-count={feedData.length}
      data-feed-surface-mode={feedSurfaceMode}
      data-feed-total-list-height={
        measuredTotalListHeight !== null
          ? `${Math.round(measuredTotalListHeight)}`
          : undefined
      }
      data-feed-visible-article-count={visibleArticleCount}
      data-inverted-scroll={isInvertedScroll ? "true" : undefined}
      ref={handleFeedSurfaceRef}
      style={FeedListConfig.FEED_LIST_FILL_STYLE}
    >
      <AnimatePresence initial={false} mode="wait">
        {shouldShowFeedSkeleton ? (
          <FeedListSkeletonFrame
            contentKey={contentKey}
            isInvertedScroll={isInvertedScroll}
          />
        ) : showEmptyState ? (
          <FeedListEmptyStateFrame
            articleFilter={articleFilter}
            contentKey={contentKey}
            hasConfiguredFeeds={hasConfiguredFeeds}
            hasSearchTerm={hasSearchTerm}
            trimmedSearchTerm={trimmedSearchTerm}
          />
        ) : (
          <FeedListPopulatedFrame {...props} />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Render the empty-state frame.
 * @param props - Empty-state frame inputs.
 * @returns The empty-state frame.
 */
function FeedListEmptyStateFrame(props: FeedListEmptyStateFrameProps) {
  const {
    articleFilter,
    contentKey,
    hasConfiguredFeeds,
    hasSearchTerm,
    trimmedSearchTerm,
  } = props;

  return (
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
      transition={FeedListConfig.CONTENT_ENTER_TRANSITION}
    >
      <FeedEmptyState
        articleFilter={articleFilter}
        hasConfiguredFeeds={hasConfiguredFeeds}
        hasSearchTerm={hasSearchTerm}
        trimmedSearchTerm={trimmedSearchTerm}
      />
    </motion.div>
  );
}

/**
 * Render the populated feed frame.
 * @param props - Feed surface props for the populated state.
 * @returns The populated feed frame.
 */
function FeedListPopulatedFrame(props: FeedListBodyProps) {
  const { contentKey, scrollViewport, shouldUseVirtualizedFeedSurface } = props;

  return (
    <motion.div
      className={
        shouldUseVirtualizedFeedSurface
          ? FeedListConfig.FEED_LIST_FRAME_CLASSNAME
          : "flex min-h-0 w-full min-w-0 flex-col"
      }
      initial={false}
      key={contentKey}
      style={
        shouldUseVirtualizedFeedSurface
          ? FeedListConfig.FEED_LIST_FILL_STYLE
          : undefined
      }
    >
      {shouldUseVirtualizedFeedSurface && scrollViewport !== null ? (
        <FeedListVirtualizedContent {...props} />
      ) : (
        <FeedListStaticContent {...props} />
      )}
    </motion.div>
  );
}

/**
 * Render the skeleton frame.
 * @param props - Skeleton frame inputs.
 * @returns The skeleton frame.
 */
function FeedListSkeletonFrame(props: FeedListSkeletonFrameProps) {
  const { contentKey, isInvertedScroll } = props;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className={FeedListConfig.FEED_LIST_FRAME_CLASSNAME}
      exit={{ opacity: 1, scale: 1 }}
      initial={{ opacity: 1, scale: 1 }}
      key={contentKey}
      style={FeedListConfig.FEED_LIST_FILL_STYLE}
      transition={{ duration: 0 }}
    >
      <FeedListSkeleton isInvertedScroll={isInvertedScroll} />
    </motion.div>
  );
}

/**
 * Render the non-virtualized populated feed frame.
 * @param props - Feed surface props for the populated state.
 * @returns The non-virtualized feed frame.
 */
function FeedListStaticContent(props: FeedListBodyProps) {
  const {
    feedData,
    isInvertedScroll,
    loadMoreSentinelRef,
    loadMoreSkeletonCount,
    renderFeedRow,
    shouldShowLoadMoreBoundary,
    shouldShowLoadMoreSkeletons,
  } = props;

  return (
    <>
      {isInvertedScroll && shouldShowLoadMoreBoundary ? (
        <div
          className="h-px w-full"
          data-feed-load-more-sentinel="true"
          ref={loadMoreSentinelRef}
        />
      ) : null}
      <FeedLoadMoreSkeletonBlock
        count={loadMoreSkeletonCount}
        placement="before-articles"
        visible={isInvertedScroll && shouldShowLoadMoreSkeletons}
      />
      {feedData.map(renderFeedRow)}
      <FeedLoadMoreSkeletonBlock
        count={loadMoreSkeletonCount}
        placement="after-articles"
        visible={!isInvertedScroll && shouldShowLoadMoreSkeletons}
      />
      {!isInvertedScroll && shouldShowLoadMoreBoundary ? (
        <div
          className="h-px w-full"
          data-feed-load-more-sentinel="true"
          ref={loadMoreSentinelRef}
        />
      ) : null}
    </>
  );
}

/**
 * Render the virtualized article content.
 * @param props - Feed surface props for the virtualized state.
 * @returns The virtualized article content.
 */
function FeedListVirtualizedContent(props: FeedListBodyProps) {
  const {
    expandedArticleKey,
    feedData,
    feedScrollMode,
    feedViewKey,
    handleTotalListHeightChange,
    hasSearchTerm,
    isCollapseScrollRestoreActive,
    isInvertedScroll,
    loadMoreSentinelRef,
    loadMoreSkeletonCount,
    renderFeedRow,
    scrollViewport,
    shouldShowLoadMoreBoundary,
    shouldShowLoadMoreSkeletons,
    virtualizedListHeight,
  } = props;

  if (scrollViewport === null) {
    return null;
  }

  return (
    <>
      <FeedLoadMoreSkeletonBlock
        count={loadMoreSkeletonCount}
        placement="before-articles"
        visible={isInvertedScroll && shouldShowLoadMoreSkeletons}
      />
      <FeedVirtualList
        articles={feedData}
        className={FeedListConfig.FEED_VIRTUALIZER_CLASSNAME}
        deferTotalListHeightChange={hasSearchTerm}
        estimatedItemHeight={FeedListConfig.FEED_DEFAULT_ITEM_HEIGHT_PX}
        expandedArticleKey={expandedArticleKey}
        feedViewKey={feedViewKey}
        isCollapseScrollRestoreActive={isCollapseScrollRestoreActive}
        key={`${feedViewKey}:${isInvertedScroll ? "inv" : "std"}`}
        loadMoreSentinelRef={loadMoreSentinelRef}
        minimumTotalListHeight={
          isInvertedScroll ? (virtualizedListHeight ?? undefined) : undefined
        }
        onTotalListHeightChange={handleTotalListHeightChange}
        renderArticle={renderFeedRow}
        scrollMode={feedScrollMode}
        scrollViewport={scrollViewport}
        showLoadMoreBoundary={shouldShowLoadMoreBoundary}
      />
      <FeedLoadMoreSkeletonBlock
        count={loadMoreSkeletonCount}
        placement="after-articles"
        visible={!isInvertedScroll && shouldShowLoadMoreSkeletons}
      />
    </>
  );
}
