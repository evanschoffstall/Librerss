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

/**
 * External inputs required to assemble the dashboard controller.
 *
 * The controller coordinates feed loading, filtering, refresh behavior, article
 * actions, and settings state. These props provide the persisted preferences and
 * callbacks owned by the parent view layer.
 */
export interface DashboardViewControllerProps {
  /** Current background refresh policy selected by the user. */
  backgroundMode: BackgroundMode;
  /** Active article distillation strategy used during on-demand extraction. */
  distillStrategy: string;
  /** Persists a background mode change initiated from the settings surface. */
  onBackgroundModeChange: (value: BackgroundMode) => void;
  /** Persists a distillation strategy change initiated from the settings surface. */
  onDistillStrategyChange: (value: string) => void;
  /** Enables deterministic placeholder data paths when the app is running without a live backend. */
  usePlaceholderData: boolean;
}

/**
 * Composes the dashboard's data flow, event wiring, and derived view model.
 *
 * This hook is the top-level coordinator for the dashboard screen. It binds the
 * lower-level hooks that manage feed fetching, category state, article actions,
 * scroll restoration, pull-to-refresh, keyboard shortcuts, and settings into a
 * single controller object consumed by the UI components.
 *
 * @param props Persisted preferences and mode toggles supplied by the parent view.
 * @returns Structured controller state grouped by dashboard sub-surface.
 */
export function useDashboardViewController({
  backgroundMode,
  distillStrategy,
  onBackgroundModeChange,
  onDistillStrategyChange,
  usePlaceholderData,
}: DashboardViewControllerProps) {
  /** Last successful batch refresh time used for the top-bar status label. */
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  /** Forces relative time labels to recompute on an interval without storing duplicate derived strings. */
  const [, setRelativeRefreshTick] = useState(0);
  const dashboardState = useDashboardViewState();

  const {
    articleFilter,
    autoRefreshIntervalMinutes,
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
    setAutoRefreshIntervalMinutes,
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

  /**
   * Centralized feed loader that owns network requests, request cancellation,
   * placeholder-mode fallbacks, and the shared loading epoch used by timeout
   * protection.
   */
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

  /**
   * Category orchestration layer that keeps sidebar category state, feed-source
   * loading, and selection-driven fetch behavior aligned.
   */
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
    flush: flushFeedScroll,
    invalidate: invalidateFeedScroll,
    ref: feedScrollRef,
    settle: settleFeedScroll,
  } = useViewportRestore(FEED_SCROLL_SESSION_KEY, sentinelScrollOffset);
  const { ref: sidebarScrollRef } = useViewportRestore(
    "librerss:scroll:sidebar",
  );

  /**
   * Article interaction coordinator for expand/collapse, hydration, read/starred
   * state mutations, and optimistic UI updates.
   */
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

  // Deferring the search and filter inputs keeps expensive derived feed-model
  // work from blocking keystrokes or quick filter toggles.
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

  /**
   * Full derived dashboard model used by the sidebar, feed list, and settings.
   *
   * The model is memoized because it performs category ordering, feed filtering,
   * selection resolution, and sidebar projection from several independently
   * changing state sources.
   */
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

  // Enforce a failsafe timeout around feed requests so the surface cannot remain
  // indefinitely stuck in a loading state if an upstream request wedges.
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

  // Keep persisted category ordering aligned with the currently available set of
  // labels without discarding user-defined order for still-present categories.
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
  const previousLoadingRef = useRef(loading);
  const pendingRefreshRestoreRef = useRef<null | {
    capturedFeed: Article[];
    capturedLastRefreshedAt: Date | null;
  }>(null);

  const handleBeforeRefresh = useCallback(() => {
    pendingRefreshRestoreRef.current = {
      capturedFeed: feed,
      capturedLastRefreshedAt: lastRefreshedAt,
    };
    captureFeedScroll();
  }, [captureFeedScroll, feed, lastRefreshedAt]);

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

  useEffect(() => {
    const wasLoading = previousLoadingRef.current;
    previousLoadingRef.current = loading;

    const pendingRestore = pendingRefreshRestoreRef.current;
    if (!pendingRestore) {
      return;
    }

    const feedChanged = pendingRestore.capturedFeed !== feed;
    const completedBatchRefresh =
      pendingRestore.capturedLastRefreshedAt !== lastRefreshedAt;
    const foregroundRefreshFinished = wasLoading && !loading;

    if (!feedChanged && !completedBatchRefresh && !foregroundRefreshFinished) {
      return;
    }

    pendingRefreshRestoreRef.current = null;
    flushFeedScroll();
  }, [feed, flushFeedScroll, lastRefreshedAt, loading]);

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
    onBeforeRefresh: handleBeforeRefresh,
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

  useDashboardIntervals({
    autoRefreshFeedList,
    autoRefreshIntervalMinutes,
    setRelativeRefreshTick,
  });

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

  /** Applies an optimistic local read-state update after a successful mark-all-read action. */
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

  /**
   * Stable sidebar props bag so presentational components can avoid rebuilding
   * event bindings and derived category projections on every render.
   */
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

  /**
   * UI-facing controller contract grouped by dashboard surface.
   *
   * Keeping the return shape segmented reduces prop-drilling noise in the page
   * component and makes each surface's dependencies explicit.
   */
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
      autoRefreshIntervalMinutes,
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
      setAutoRefreshIntervalMinutes,
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
