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
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  isInvertedFeedScrollMode,
  observeFeedViewportHeightOwners,
  resolveFeedScrollMode,
  resolveFeedScrollModeArticles,
  syncViewportToBottomIfNeeded,
  useServerLoadSkeletonHold,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state";
import { FeedEmptyState } from "@/app/dashboard/dashboard-components/feed-view/FeedEmptyState";
import { type FeedListProps } from "@/app/dashboard/dashboard-components/feed-view/FeedList.types";
import {
  FeedListConfig,
  FeedListSkeleton,
  FeedLoadMoreSkeletonBlock,
  resolveFeedPlaceholderState,
  useFeedRowRenderer,
  useFeedSurfaceHostRef,
  useFeedVirtualListHeightChange,
} from "@/app/dashboard/dashboard-components/feed-view/FeedListComposition";
import { FeedVirtualList } from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualList";
import { useFeedListSurfaceState } from "@/app/dashboard/dashboard-components/feed-view/list-state";
import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { MOBILE_INVERTED_SCROLL_STORAGE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { useIsBelowDesktop, useLocalStorage } from "@/lib/hooks";

export const FeedList = memo(
  /**
   * Render the feed list component.
   * @param props - The component props.
   * @returns The rendered feed list component.
   */
  function FeedList(props: FeedListProps) {
    const {
      animatingInArticleKeys,
      articleFilter,
      articlesPerPage,
      canLoadMoreFromServer: canLoadMoreFromServerProp,
      collapsingArticles = FeedListConfig.EMPTY_COLLAPSING_ARTICLES,
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
      isRefreshing,
      isSearchFetching = false,
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
    } = props;
    const isBelowDesktop = useIsBelowDesktop();
    const [mobileInvertedScroll] = useLocalStorage(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      false,
    );
    const canLoadMoreFromServer =
      canLoadMoreFromServerProp ?? typeof onLoadMore === "function";
    const feedScrollMode = resolveFeedScrollMode(
      isBelowDesktop,
      FeedListConfig.IS_INVERTED_SCROLL_FEATURE_ENABLED_IN_RUNTIME &&
        mobileInvertedScroll,
    );
    const isActiveInvertedScroll = isInvertedFeedScrollMode(feedScrollMode);
    const { resolvedTheme } = useTheme();
    const isDark = (resolvedTheme ?? "dark") === "dark";
    const isMountedRef = useRef(true);
    const [hasInvertedExpansionHistory, setHasInvertedExpansionHistory] =
      useState(false);
    const [measuredTotalListHeight, setMeasuredTotalListHeight] = useState<
      null | number
    >(null);
    const scrollViewportRef = useRef<HTMLElement | null>(null);
    const expansionHistoryResetTimeoutRef = useRef<null | number>(null);
    const invertedHeightFloorRef = useRef<null | number>(null);
    const invertedHydrationAnchorFrameRef = useRef<null | number>(null);
    const previousExpandedArticleKeyRef = useRef(expandedArticleKey);
    const preExpandViewportSnapshotGetter =
      getPreExpandViewportSnapshot ??
      FeedListConfig.EMPTY_PRE_EXPAND_VIEWPORT_SNAPSHOT;
    const {
      contentKey,
      feedSurfaceMode,
      handleViewportHostRef,
      hasActiveInvertedExpansionScrollLock,
      hasMoreArticles,
      hasSearchTerm,
      invertedPaginationAnchorRef,
      isCachedPageRevealing,
      isInvertedScroll,
      isPendingServerRevealVisible,
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
      canLoadMoreFromServer,
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
      isRefreshing,
      onLoadMore,
      refreshEpoch,
      searchTerm,
    });

    const visibleFeed = filteredFeed.slice(0, visibleArticleCount);
    const shouldShowLoadMoreBoundary = hasMoreArticles || canLoadMoreFromServer;
    const isServerLoadSkeletonActive = useServerLoadSkeletonHold(isLoadingMore);
    const showLoadMoreSkeletons =
      isPendingServerRevealVisible ||
      isServerLoadSkeletonActive ||
      isCachedPageRevealing;
    const loadMoreSkeletonCount = showLoadMoreSkeletons ? articlesPerPage : 0;

    const feedData = useMemo(
      () => resolveFeedScrollModeArticles(visibleFeed, feedScrollMode),
      [feedScrollMode, visibleFeed],
    );
    const hasInvertedExpansionScrollLock =
      isInvertedScroll && hasActiveInvertedExpansionScrollLock();
    const shouldUseVirtualizedFeedSurface =
      shouldUseVirtualizedFeed &&
      expandedArticleKey === null &&
      !(isInvertedScroll && hasInvertedExpansionHistory) &&
      !(
        isInvertedScroll &&
        (isCollapseScrollRestoreActive || hasInvertedExpansionScrollLock)
      );

    scrollViewportRef.current = scrollViewport;

    useEffect(() => {
      return () => {
        isMountedRef.current = false;

        if (invertedHydrationAnchorFrameRef.current !== null) {
          window.cancelAnimationFrame(invertedHydrationAnchorFrameRef.current);
        }

        if (expansionHistoryResetTimeoutRef.current !== null) {
          window.clearTimeout(expansionHistoryResetTimeoutRef.current);
        }
      };
    }, []);

    useEffect(() => {
      invertedHeightFloorRef.current = null;
    }, [articleFilter, feedViewKey, isActiveInvertedScroll, searchTerm]);

    useEffect(() => {
      setHasInvertedExpansionHistory(false);
    }, [articleFilter, feedViewKey, isActiveInvertedScroll, searchTerm]);

    useEffect(() => {
      if (
        !isInvertedScroll ||
        !hasInvertedExpansionHistory ||
        expandedArticleKey !== null ||
        isCollapseScrollRestoreActive ||
        hasInvertedExpansionScrollLock
      ) {
        if (expansionHistoryResetTimeoutRef.current !== null) {
          window.clearTimeout(expansionHistoryResetTimeoutRef.current);
          expansionHistoryResetTimeoutRef.current = null;
        }

        return;
      }

      expansionHistoryResetTimeoutRef.current = window.setTimeout(() => {
        expansionHistoryResetTimeoutRef.current = null;
        setHasInvertedExpansionHistory(false);
      }, 150);

      return () => {
        if (expansionHistoryResetTimeoutRef.current !== null) {
          window.clearTimeout(expansionHistoryResetTimeoutRef.current);
          expansionHistoryResetTimeoutRef.current = null;
        }
      };
    }, [
      expandedArticleKey,
      hasInvertedExpansionHistory,
      hasInvertedExpansionScrollLock,
      isCollapseScrollRestoreActive,
      isInvertedScroll,
    ]);

    useLayoutEffect(() => {
      const previousExpandedArticleKey = previousExpandedArticleKeyRef.current;
      previousExpandedArticleKeyRef.current = expandedArticleKey;

      if (!isActiveInvertedScroll) {
        return;
      }

      if (expandedArticleKey !== null || previousExpandedArticleKey !== null) {
        setHasInvertedExpansionHistory(true);
      }

      if (expandedArticleKey !== null) {
        invertedHeightFloorRef.current = null;
        return;
      }

      if (previousExpandedArticleKey === null) {
        return;
      }

      syncInvertedExpansionScrollLock();

      const viewport = scrollViewportRef.current;

      if (
        viewport &&
        viewport.scrollHeight > (invertedHeightFloorRef.current ?? 0)
      ) {
        invertedHeightFloorRef.current = viewport.scrollHeight;
      }
    }, [
      expandedArticleKey,
      isActiveInvertedScroll,
      syncInvertedExpansionScrollLock,
    ]);

    const prevCollapsingArticleCountRef = useRef(
      Object.keys(collapsingArticles).length,
    );
    useLayoutEffect(() => {
      if (!isActiveInvertedScroll || expandedArticleKey !== null) {
        return;
      }

      const previousCount = prevCollapsingArticleCountRef.current;
      const currentCount = Object.keys(collapsingArticles).length;
      prevCollapsingArticleCountRef.current = currentCount;

      if (currentCount > 0 && previousCount === 0) {
        const viewport = scrollViewportRef.current;

        if (
          viewport &&
          viewport.scrollHeight > (invertedHeightFloorRef.current ?? 0)
        ) {
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
    }, [
      isActiveInvertedScroll,
      measuredTotalListHeight,
      scrollViewport?.clientHeight,
    ]);
    const lastFeedArticle = feedData.at(-1);
    const lastFeedArticleKey = lastFeedArticle
      ? getArticleKey(lastFeedArticle)
      : null;
    const handleTotalListHeightChange = useFeedVirtualListHeightChange({
      hasSearchTerm,
      invertedHeightFloorRef,
      invertedPaginationAnchorRef,
      isCollapseScrollRestoreActive,
      isInvertedScroll,
      isMountedRef,
      isSearchFetching,
      maybeAutoFillViewport,
      scrollViewport,
      setMeasuredTotalListHeight,
      shouldAutoAnchorInvertedScroll,
      shouldLockInitialNormalScroll,
      syncInvertedExpansionScrollLock,
      syncInvertedPaginationAnchor,
    });

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

      invertedHydrationAnchorFrameRef.current = window.requestAnimationFrame(
        () => {
          invertedHydrationAnchorFrameRef.current = null;
          syncViewportToBottomIfNeeded(scrollViewport);
        },
      );

      return () => {
        if (invertedHydrationAnchorFrameRef.current !== null) {
          window.cancelAnimationFrame(invertedHydrationAnchorFrameRef.current);
          invertedHydrationAnchorFrameRef.current = null;
        }
      };
    }, [
      feedData.length,
      isInvertedScroll,
      scrollViewport,
      shouldAutoAnchorInvertedScroll,
    ]);

    useLayoutEffect(() => {
      if (
        !isInvertedScroll ||
        scrollViewport === null ||
        !shouldAutoAnchorInvertedScroll()
      ) {
        return undefined;
      }

      let anchorFrameId: null | number = null;
      /**
       * Keep an auto-owned inverted viewport pinned to the current feed bottom.
       */
      const syncAutoAnchoredViewport = () => {
        if (shouldAutoAnchorInvertedScroll()) {
          syncViewportToBottomIfNeeded(scrollViewport);
        }
      };
      /**
       * Defer the bottom sync until after the latest virtualizer layout commit.
       */
      const scheduleAutoAnchorSync = () => {
        if (anchorFrameId !== null) {
          window.cancelAnimationFrame(anchorFrameId);
        }

        anchorFrameId = window.requestAnimationFrame(() => {
          anchorFrameId = null;
          syncAutoAnchoredViewport();
        });
      };

      syncAutoAnchoredViewport();
      scheduleAutoAnchorSync();

      const disconnectHeightOwnerObserver = observeFeedViewportHeightOwners(
        scrollViewport,
        scheduleAutoAnchorSync,
      );

      return () => {
        disconnectHeightOwnerObserver();

        if (anchorFrameId !== null) {
          window.cancelAnimationFrame(anchorFrameId);
        }
      };
    }, [
      contentKey,
      feedData.length,
      isInvertedScroll,
      loadMoreSkeletonCount,
      scrollViewport,
      shouldAutoAnchorInvertedScroll,
    ]);

    const renderFeedRow = useFeedRowRenderer({
      animatingInArticleKeys,
      collapsingArticles,
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isBelowDesktop,
      isDark,
      lastFeedArticleKey,
      onEnteringDone,
      onExpandedSwipeRead,
      onPrepareExpand,
      onSwipeRead,
      onToggle,
      onToggleRead,
      onToggleStarred,
      showFavicons,
      updatingArticleState,
    });

    const { shouldShowFeedSkeleton, showEmptyState } =
      resolveFeedPlaceholderState(
        isInitialLoading,
        isRefreshing || isSearchFetching,
        shouldShowViewportResolutionSkeleton,
        filteredFeed.length,
      );
    const handleFeedSurfaceRef = useFeedSurfaceHostRef({
      handleViewportHostRef,
      shouldShowFeedSkeleton,
      showEmptyState,
    });

    return (
      <>
        <div
          className={FeedListConfig.FEED_LIST_SURFACE_CLASSNAME}
          data-feed-load-more-skeleton-count={
            showLoadMoreSkeletons && loadMoreSkeletonCount > 0
              ? loadMoreSkeletonCount
              : undefined
          }
          data-feed-load-more-skeletons-visible={
            showLoadMoreSkeletons && loadMoreSkeletonCount > 0
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
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className={FeedListConfig.FEED_LIST_FRAME_CLASSNAME}
                exit={{ opacity: 0, scale: 0.995 }}
                initial={{ opacity: 1, scale: 1 }}
                key={contentKey}
                style={FeedListConfig.FEED_LIST_FILL_STYLE}
                transition={FeedListConfig.SKELETON_EXIT_TRANSITION}
              >
                <FeedListSkeleton isInvertedScroll={isInvertedScroll} />
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
                transition={FeedListConfig.CONTENT_ENTER_TRANSITION}
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
                    <FeedLoadMoreSkeletonBlock
                      count={loadMoreSkeletonCount}
                      visible={isInvertedScroll && showLoadMoreSkeletons}
                    />
                    <FeedVirtualList
                      articles={feedData}
                      className={FeedListConfig.FEED_VIRTUALIZER_CLASSNAME}
                      deferTotalListHeightChange={hasSearchTerm}
                      estimatedItemHeight={
                        FeedListConfig.FEED_DEFAULT_ITEM_HEIGHT_PX
                      }
                      expandedArticleKey={expandedArticleKey}
                      feedViewKey={feedViewKey}
                      isCollapseScrollRestoreActive={
                        isCollapseScrollRestoreActive
                      }
                      key={`${feedViewKey}:${isInvertedScroll ? "inv" : "std"}`}
                      loadMoreSentinelRef={loadMoreSentinelRef}
                      minimumTotalListHeight={
                        isInvertedScroll
                          ? (virtualizedListHeight ?? undefined)
                          : undefined
                      }
                      onTotalListHeightChange={handleTotalListHeightChange}
                      renderArticle={renderFeedRow}
                      scrollMode={feedScrollMode}
                      scrollViewport={scrollViewport}
                      showLoadMoreBoundary={shouldShowLoadMoreBoundary}
                    />
                    <FeedLoadMoreSkeletonBlock
                      count={loadMoreSkeletonCount}
                      visible={!isInvertedScroll && showLoadMoreSkeletons}
                    />
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
                    <FeedLoadMoreSkeletonBlock
                      count={loadMoreSkeletonCount}
                      visible={isInvertedScroll && showLoadMoreSkeletons}
                    />
                    {feedData.map(renderFeedRow)}
                    <FeedLoadMoreSkeletonBlock
                      count={loadMoreSkeletonCount}
                      visible={!isInvertedScroll && showLoadMoreSkeletons}
                    />
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
      </>
    );
  },
);
