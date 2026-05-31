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
  resolveFeedScrollMode,
  resolveFeedScrollModeArticles,
  useServerLoadSkeletonHold,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state";
import { type FeedListProps } from "@/app/dashboard/components/feed-view/FeedList.types";
import { FeedListBody } from "@/app/dashboard/components/feed-view/FeedListBody";
import {
  FeedListConfig,
  resolveFeedPlaceholderState,
  useFeedRowRenderer,
  useFeedSurfaceHostRef,
  useFeedVirtualListHeightChange,
} from "@/app/dashboard/components/feed-view/FeedListComposition";
import { useFeedListEnteringArticleKeys } from "@/app/dashboard/components/feed-view/FeedListEnteringArticleKeys";
import { useFeedListInvertedAutoAnchor } from "@/app/dashboard/components/feed-view/FeedListInvertedAutoAnchor";
import { useFeedListSurfaceState } from "@/app/dashboard/components/feed-view/list-state";
import { getArticleKey } from "@/app/dashboard/services/article-collection";
import {
  DASHBOARD_ARTICLE_VIEW_MODE_STORAGE_KEY,
  MOBILE_INVERTED_SCROLL_STORAGE_KEY,
} from "@/app/dashboard/services/dashboard-constants";
import {
  type DashboardArticleViewMode,
  DEFAULT_DASHBOARD_ARTICLE_VIEW_MODE,
  normalizeDashboardArticleViewMode,
} from "@/app/dashboard/services/dashboard-view-mode";
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
    const [storedArticleViewMode] = useLocalStorage<DashboardArticleViewMode>(
      DASHBOARD_ARTICLE_VIEW_MODE_STORAGE_KEY,
      DEFAULT_DASHBOARD_ARTICLE_VIEW_MODE,
    );
    const articleViewMode = normalizeDashboardArticleViewMode(
      storedArticleViewMode,
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
    const lastRenderedArticleKey =
      !isInvertedScroll && showLoadMoreSkeletons && loadMoreSkeletonCount > 0
        ? null
        : lastFeedArticleKey;
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

    useFeedListInvertedAutoAnchor({
      contentKey,
      feedDataLength: feedData.length,
      isInvertedScroll,
      loadMoreSkeletonCount,
      scrollViewport,
      shouldAutoAnchorInvertedScroll,
      virtualizedListHeight,
    });

    const { combinedEnteringArticleKeys, handleArticleEnteringDone } =
      useFeedListEnteringArticleKeys({
        animatingInArticleKeys,
        articleFilter,
        feedViewKey,
        onEnteringDone,
        searchTerm,
        visibleFeed,
      });

    const renderFeedRow = useFeedRowRenderer({
      animatingInArticleKeys: combinedEnteringArticleKeys,
      articleViewMode,
      collapsingArticles,
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isBelowDesktop,
      isDark,
      lastFeedArticleKey: lastRenderedArticleKey,
      onEnteringDone: handleArticleEnteringDone,
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
      <FeedListBody
        articleFilter={articleFilter}
        contentKey={contentKey}
        expandedArticleKey={expandedArticleKey}
        feedData={feedData}
        feedScrollMode={feedScrollMode}
        feedSurfaceMode={feedSurfaceMode}
        feedViewKey={feedViewKey}
        handleFeedSurfaceRef={handleFeedSurfaceRef}
        handleTotalListHeightChange={handleTotalListHeightChange}
        hasConfiguredFeeds={hasConfiguredFeeds}
        hasSearchTerm={hasSearchTerm}
        isCollapseScrollRestoreActive={isCollapseScrollRestoreActive}
        isInvertedScroll={isInvertedScroll}
        loadMoreSentinelRef={loadMoreSentinelRef}
        loadMoreSkeletonCount={loadMoreSkeletonCount}
        measuredTotalListHeight={measuredTotalListHeight}
        renderFeedRow={renderFeedRow}
        scrollViewport={scrollViewport}
        shouldShowFeedSkeleton={shouldShowFeedSkeleton}
        shouldShowLoadMoreBoundary={shouldShowLoadMoreBoundary}
        shouldShowLoadMoreSkeletons={showLoadMoreSkeletons}
        shouldUseVirtualizedFeedSurface={shouldUseVirtualizedFeedSurface}
        showEmptyState={showEmptyState}
        trimmedSearchTerm={trimmedSearchTerm}
        virtualizedListHeight={virtualizedListHeight}
        visibleArticleCount={visibleArticleCount}
      />
    );
  },
);
