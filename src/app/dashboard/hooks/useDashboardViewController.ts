"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type BackgroundMode, FEED_SCROLL_SESSION_KEY } from "../constants";
import { computeNextOrderedCategoryLabels } from "../services/category-display";
import { buildDashboardViewModel } from "../services/dashboard-view-model";
import { formatLastRefreshLabel } from "../services/feed-loader-helpers";

import { useArticleActions } from "./useArticleActions";
import { useCategoryManager } from "./useCategoryManager";
import { useDashboardEvents } from "./useDashboardEvents";
import { useDashboardIntervals } from "./useDashboardIntervals";
import {
  useDashboardBroadcasts,
  useDashboardInitialization,
  useFeedLoadingTimeout,
  useLockDocumentScroll,
  useRevealSidebarOnMount,
} from "./useDashboardViewEffects";
import { useDashboardViewHandlers } from "./useDashboardViewHandlers";
import { useDashboardViewState } from "./useDashboardViewState";
import { useFeedLoader } from "./useFeedLoader";
import { useFeedPullOffset, useFeedPullRefresh } from "./useFeedSurface";
import { useFeedVisibilityObserver } from "./useFeedVisibilityObserver";

import { type Article } from "@/lib";
import { useViewportRestore } from "@/lib/hooks/useViewportRestore";

export interface DashboardViewControllerProps {
  backgroundMode: BackgroundMode;
  distillStrategy: string;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  usePlaceholderData: boolean;
}

export function useDashboardViewController({
  backgroundMode,
  distillStrategy,
  onBackgroundModeChange,
  onDistillStrategyChange,
  usePlaceholderData,
}: DashboardViewControllerProps) {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [, setRelativeRefreshTick] = useState(0);
  const dashboardState = useDashboardViewState();

  const {
    articleFilter,
    categories,
    expandedArticleKey,
    feed,
    loading,
    searchTerm,
    selectedCategory,
    showFavicons,
    showSettingsModal,
    visibleCount,
  } = dashboardState;
  const {
    categoriesRef,
    hasInitializedDashboardRef,
    isCategoriesLoading,
    isMobileSidebarOpen,
    isSidebarVisible,
    pageSize,
    sentinelRef,
  } = dashboardState;
  const {
    setArticleFilter,
    setCategories,
    setExpandedArticleKey,
    setFeed,
    setIsCategoriesLoading,
    setIsMobileSidebarOpen,
    setIsSidebarVisible,
    setLoading,
    setPageSize,
    setSearchTerm,
    setSelectedCategory,
    setShowFavicons,
    setShowSettingsModal,
    setVisibleCount,
  } = dashboardState;

  const feedLoader = useFeedLoader({
    categoriesRef,
    onFeedBatchLoaded: setLastRefreshedAt,
    setCategories,
    setExpandedArticleKey,
    setFeed,
    setLoading,
    usePlaceholderData,
  });

  const {
    cancelPendingRequest,
    FEED_LOADING_FAILSAFE_MS,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    loadingEpoch,
  } = feedLoader;

  const categoryManager = useCategoryManager({
    categories,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    selectedCategory,
    setCategories,
    setFeed,
    setSelectedCategory,
    usePlaceholderData,
  });

  /** Hidden rest offset used by the pull-to-refresh surface and scroll restore logic. */
  const sentinelScrollOffset = useFeedPullOffset();
  /** Shared scroll-snap suppression flag used while gesture-driven animations are in flight. */
  const suppressSnapRef = useRef<false | number>(false);
  const {
    capture: captureFeedScroll,
    invalidate: invalidateFeedScroll,
    ref: feedScrollRef,
    settle: settleFeedScroll,
  } = useViewportRestore(FEED_SCROLL_SESSION_KEY, sentinelScrollOffset);
  const { ref: sidebarScrollRef } = useViewportRestore(
    "librerss:scroll:sidebar",
  );

  const articleActions = useArticleActions({
    articleFilter,
    categories,
    distillStrategy,
    expandedArticleKey,
    feed,
    onExpand: settleFeedScroll,
    setExpandedArticleKey,
    setFeed,
    suppressSnapRef,
    usePlaceholderData,
  });

  const {
    collapsingArticleKey,
    handleArticleToggle,
    handleExpandedSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
    hydratedArticleLinks,
    hydratingArticleLinks,
    updatingArticleState,
  } = articleActions;

  const {
    customCategoryLabels,
    orderedCategoryLabels,
    setOrderedCategoryLabels,
  } = categoryManager;
  const deferredArticleFilter = useDeferredValue(articleFilter);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const isSearchPending = searchTerm !== deferredSearchTerm;
  const isQuickFilterPending =
    articleFilter !== deferredArticleFilter &&
    searchTerm === deferredSearchTerm;
  const isFeedListLoading = loading || isQuickFilterPending || isSearchPending;

  const onArticleToggle = useCallback(
    (article: Article) => void handleArticleToggle(article),
    [handleArticleToggle],
  );
  const onArticleToggleRead = useCallback(
    (article: Article) => void handleToggleReadState(article),
    [handleToggleReadState],
  );
  const onArticleExpandedSwipeRead = useCallback(
    (article: Article) => {
      handleExpandedSwipeRead(article);
    },
    [handleExpandedSwipeRead],
  );
  const onArticleToggleStarred = useCallback(
    (article: Article) => void handleToggleStarredState(article),
    [handleToggleStarredState],
  );

  const dashboardViewModel = useMemo(
    () =>
      buildDashboardViewModel({
        articleFilter: deferredArticleFilter,
        categories,
        collapsingArticleKey,
        customCategoryLabels,
        expandedArticleKey,
        feed,
        orderedCategoryLabels,
        searchTerm: deferredSearchTerm,
        selectedCategory,
      }),
    [
      categories,
      collapsingArticleKey,
      customCategoryLabels,
      deferredArticleFilter,
      deferredSearchTerm,
      expandedArticleKey,
      feed,
      orderedCategoryLabels,
      selectedCategory,
    ],
  );

  const {
    categoryOptions,
    displayCategories,
    filteredFeed,
    selectedFeed,
    selectedFeedUrl,
    sidebarCategories,
  } = dashboardViewModel;

  const selectedCategoryNode = useMemo(
    () => dashboardViewModel.selectedCategoryNode,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCategory, categories],
  );

  useFeedLoadingTimeout({
    loading,
    loadingEpoch,
    onTimeout: cancelPendingRequest,
    setLoading,
    timeoutMs: FEED_LOADING_FAILSAFE_MS,
  });
  useLockDocumentScroll();
  useRevealSidebarOnMount(setIsSidebarVisible);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [
    articleFilter,
    deferredSearchTerm,
    pageSize,
    selectedCategory,
    setVisibleCount,
  ]);

  // Initial dashboard boot chooses the starting category and kicks off the first
  // feed/category load sequence exactly once.
  useDashboardInitialization({
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasInitializedDashboardRef,
    loadFeedSources,
    selectedCategory,
    setIsCategoriesLoading,
    setSelectedCategory,
  });

  useEffect(() => {
    setOrderedCategoryLabels((currentLabels) =>
      computeNextOrderedCategoryLabels(
        categories,
        customCategoryLabels,
        currentLabels,
      ),
    );
  }, [categories, customCategoryLabels, setOrderedCategoryLabels]);

  useDashboardBroadcasts({
    isSearchPending,
    searchTerm,
    selectedFeed,
  });

  const previousSelectedCategoryRef = useRef(selectedCategory);
  const previousArticleFilterRef = useRef(articleFilter);

  useEffect(() => {
    const categoryChanged =
      previousSelectedCategoryRef.current !== selectedCategory;
    const filterChanged = previousArticleFilterRef.current !== articleFilter;

    if (categoryChanged || filterChanged) {
      setExpandedArticleKey(null);
      invalidateFeedScroll();
    }

    previousSelectedCategoryRef.current = selectedCategory;
    previousArticleFilterRef.current = articleFilter;
  }, [
    articleFilter,
    invalidateFeedScroll,
    selectedCategory,
    setExpandedArticleKey,
  ]);

  /** Root scroll element for the feed surface, shared by visibility and pull-refresh hooks. */
  const feedScrollRootRef = useRef<HTMLElement | null>(null);
  /** Wrapper around the rendered feed list, exposed for layout-sensitive consumers. */
  const feedWrapperRef = useRef<HTMLDivElement | null>(null);

  /**
   * Merges local feed-scroll bookkeeping with persisted viewport restoration.
   *
   * The dashboard needs direct access to the scroll root for observer-based list
   * growth, while the viewport restore hook needs the same node to capture and
   * reapply position across feed changes.
   */
  const mergedFeedScrollRef = useCallback(
    (node: HTMLElement | null) => {
      feedScrollRootRef.current = node;
      feedScrollRef(node);
    },
    [feedScrollRef],
  );

  useFeedVisibilityObserver({
    pageSize,
    scrollRootRef: feedScrollRootRef,
    sentinelRef,
    setVisibleCount,
    totalFeedItems: filteredFeed.length,
  });

  const {
    autoRefreshFeedList,
    handleCategoryClick,
    handleFeedClick,
    handleRefreshSelection,
    refreshFeedList,
  } = useDashboardViewHandlers({
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    onBeforeRefresh: captureFeedScroll,
    onFeedSwitch: useCallback(() => {
      invalidateFeedScroll();
      setArticleFilter("unread");
    }, [invalidateFeedScroll, setArticleFilter]),
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    setIsMobileSidebarOpen,
    setSelectedCategory,
  });

  useDashboardIntervals({ autoRefreshFeedList, setRelativeRefreshTick });

  /**
   * Pull-to-refresh gesture state for touch and trackpad interactions on the
   * feed surface.
   */
  const {
    pulling: isPulling,
    readyToRefresh,
    sentinelHeight,
    sentinelRef: pullSentinelRef,
  } = useFeedPullRefresh(
    feedScrollRootRef,
    refreshFeedList,
    isFeedListLoading,
    suppressSnapRef,
  );

  const lastRefreshLabel = usePlaceholderData
    ? "demo"
    : formatLastRefreshLabel(lastRefreshedAt);

  const handleMarkAllReadLocally = useCallback(() => {
    setFeed((currentFeed) =>
      currentFeed.map((article) => ({ ...article, isRead: true })),
    );
  }, [setFeed]);

  useDashboardEvents({
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    onMarkAllReadLocally: handleMarkAllReadLocally,
    onOpenFeedsSidebar: useCallback(() => {
      setIsMobileSidebarOpen(true);
    }, [setIsMobileSidebarOpen]),
    onOpenSettings: useCallback(() => {
      setShowSettingsModal(true);
    }, [setShowSettingsModal]),
    onRefresh: handleRefreshSelection,
    onSearchChange: setSearchTerm,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    usePlaceholderData,
  });

  const handleCloseSettings = useCallback(() => {
    setShowSettingsModal(false);
  }, [setShowSettingsModal]);

  const sidebarProps = useMemo(
    () => ({
      isCategoriesLoading,
      isSidebarVisible,
      onCategoryClick: handleCategoryClick,
      onFeedClick: handleFeedClick,
      selectedCategory,
      showFavicons,
      sidebarCategories,
    }),
    [
      handleCategoryClick,
      handleFeedClick,
      isCategoriesLoading,
      isSidebarVisible,
      selectedCategory,
      showFavicons,
      sidebarCategories,
    ],
  );

  return {
    feedList: {
      expandedArticleKey,
      feedWrapperRef,
      filteredFeed,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isPulling,
      loading: isFeedListLoading,
      mergedFeedScrollRef,
      onArticleExpandedSwipeRead,
      onArticleToggle,
      onArticleToggleRead,
      onArticleToggleStarred,
      pullRefreshHint: readyToRefresh
        ? "Release to refresh"
        : "Pull down to refresh",
      pullSentinelRef,
      readyToRefresh,
      searchTerm,
      sentinelHeight,
      sentinelRef,
      showFavicons,
      updatingArticleState,
      visibleCount,
    },
    settings: {
      backgroundMode,
      categories: displayCategories,
      categoryManager,
      categoryOptions,
      distillStrategy,
      handleCloseSettings,
      onBackgroundModeChange,
      onDistillStrategyChange,
      pageSize,
      selectedCategory,
      setPageSize,
      setShowFavicons,
      showFavicons,
      showSettingsModal,
      usePlaceholderData,
    },
    sidebar: {
      isMobileSidebarOpen,
      isSidebarVisible,
      setIsMobileSidebarOpen,
      sidebarProps,
      sidebarScrollRef,
    },
    topBar: {
      articleFilter,
      lastRefreshLabel,
      loading,
      setArticleFilter,
    },
  };
}
