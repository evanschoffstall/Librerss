"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useViewportRestore } from "@/lib";

import { ALL_FEEDS_NODE_KEY, type BackgroundMode, DASHBOARD_EVENTS, INITIAL_CATEGORIES } from "../constants";
import {
  resolveArticleWindowAvailability,
  shouldBlockArticleWindowLoadMore,
  shouldRefillDepletedUnreadWindow,
} from "../services/article-window-availability";
import { computeNextOrderedCategoryLabels } from "../services/category-display";
import { getAllFeedNodes } from "../services/category-tree";
import {
  buildDashboardControllerState,
  buildDashboardSidebarContentProps,
} from "../services/dashboard-controller-state";
import { buildDashboardViewModel } from "../services/dashboard-view-model";
import { refreshCurrentSelection } from "../services/selection";
import { collectFullyVisibleUnreadArticles } from "../services/viewport-read";
import { useArticleActions } from "./useArticleActions";
import { useDashboardArticleCallbacks } from "./useDashboardArticleCallbacks";
import { useDashboardCategoryTree } from "./useDashboardCategoryTree";
import { useDashboardEffects } from "./useDashboardEffects";
import { useDashboardEvents } from "./useDashboardEvents";
import { useDashboardHandlers } from "./useDashboardHandlers";
import { useDashboardIntervals } from "./useDashboardIntervals";
import { useDashboardState } from "./useDashboardState";
import { useFeedLoader } from "./useFeedLoader";
import { useRefreshStatus } from "./useRefreshStatus";

/**
 * External inputs required to assemble the dashboard controller.
 *
 * The controller coordinates feed loading, filtering, refresh behavior, article
 * actions, and settings state. These props provide the persisted preferences and
 * callbacks owned by the parent view layer.
 */
export interface DashboardControllerProps {
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
export function useDashboardController({
  backgroundMode,
  distillStrategy,
  onBackgroundModeChange,
  onDistillStrategyChange,
  usePlaceholderData,
}: DashboardControllerProps) {
  const SHELL_LOADING_SETTLE_MS = 140;
  const serverLoadMorePageBatch = 1;
  const refreshStatus = useRefreshStatus(usePlaceholderData);
  const {
    lastRefreshLabel,
    setLastRefreshedAt,
    setRelativeRefreshTick,
  } = refreshStatus;

  /**
   * Keys of articles whose entrance animation is currently running (arrived via
   * background auto-refresh). Excluded from "mark visible as read" until they settle.
   */
  const [animatingInArticleKeys, setAnimatingInArticleKeys] = useState(
    () => new Set<string>(),
  );
  /** Mirrors the auto-refresh in-flight state to the filter-bar loading indicator. */
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  /** Ref prevents concurrent auto-refresh calls from double-dispatching events. */
  const isAutoRefreshingRef = useRef(false);

  /** Merges newly arrived article keys into the animating-in set. */
  const handleNewArticlesArrived = useCallback(
    (newKeys: ReadonlySet<string>) => {
      if (newKeys.size === 0) return;
      setAnimatingInArticleKeys((prev) => new Set([...prev, ...newKeys]));
    },
    [],
  );

  /** Removes a settled article from the animating-in set. */
  const handleArticleEnteringDone = useCallback((articleKey: string) => {
    setAnimatingInArticleKeys((prev) => {
      if (!prev.has(articleKey)) return prev;
      const next = new Set(prev);
      next.delete(articleKey);
      return next;
    });
  }, []);

  const dashboardState = useDashboardState();

  const {
    articleFilter,
    articlesPerPage,
    autoRefreshIntervalMinutes,
    categories,
    expandedArticleKey,
    feed,
    loading,
    searchTerm,
    selectedCategory,
    showFavicons,
    showSettingsModal,
  } = dashboardState;
  const {
    categoriesRef,
    feedRef,
    hasInitializedDashboardRef,
    isCategoriesLoading,
    isMobileSidebarOpen,
    isSidebarVisible,
  } = dashboardState;
  const {
    setArticleFilter,
    setArticlesPerPage,
    setAutoRefreshIntervalMinutes,
    setCategories,
    setExpandedArticleKey,
    setFeed,
    setIsCategoriesLoading,
    setIsMobileSidebarOpen,
    setIsSidebarVisible,
    setLoading,
    setSearchTerm,
    setSelectedCategory,
    setShowFavicons,
    setShowSettingsModal,
  } = dashboardState;
  const trimmedSearchTerm = searchTerm.trim();
  const shouldUseArticleWindow = !usePlaceholderData && trimmedSearchTerm === "";
  const [requestedArticleLimit, setRequestedArticleLimit] = useState(articlesPerPage);
  const [isLoadingMoreArticles, setIsLoadingMoreArticles] = useState(false);
  const [hasMoreServerArticles, setHasMoreServerArticles] = useState(
    shouldUseArticleWindow,
  );
  const [isShellLoading, setIsShellLoading] = useState(true);
  const isLoadingMoreArticlesRef = useRef(false);
  const isAwaitingArticleWindowSettlementRef = useRef(shouldUseArticleWindow);
  const allowPartialArticleWindowGrowthRef = useRef(false);
  const previousAwaitedFeedLengthRef = useRef(0);
  const hasStartedArticleWindowSettlementRef = useRef(false);
  const isRefillingDepletedUnreadWindowRef = useRef(false);
  /** Tracks the highest article-limit we have already prefetched to avoid duplicate background requests. */
  const lastPrefetchedLimitRef = useRef(0);
  const shellLoadingTimeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  /**
   * Centralized feed loader that owns network requests, request cancellation,
   * placeholder-mode fallbacks, and the shared loading epoch used by timeout
   * protection.
   */
  const feedLoader = useFeedLoader({
    articleFilter,
    categoriesRef,
    feedRef,
    onFeedBatchLoaded: setLastRefreshedAt,
    onNewArticlesArrived: handleNewArticlesArrived,
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
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    prefetchFeed,
  } = feedLoader;

  /**
   * Category orchestration layer that keeps sidebar category state, feed-source
   * loading, and selection-driven fetch behavior aligned.
   */
  const categoryTree = useDashboardCategoryTree({
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
    setExpandedArticleKey,
    setFeed,
    usePlaceholderData,
  });

  const {
    capturePreExpandSnapshot,
    collapsingArticles,
    getPreExpandViewportSnapshot,
    handleArticleToggle,
    handleExpandedSwipeRead,
    handleMarkArticlesRead,
    handleSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
    hydratedArticleLinks,
    hydratingArticleLinks,
    isCollapseScrollRestoreActive,
    updatingArticleState,
  } = articleActions;

  const {
    customCategoryLabels,
    orderedCategoryLabels,
    setOrderedCategoryLabels,
  } = categoryTree;

  // Deferring the search and filter inputs keeps expensive derived feed-model
  // work from blocking keystrokes or quick filter toggles.
  const deferredArticleFilter = useDeferredValue(articleFilter);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const isSearchPending = searchTerm !== deferredSearchTerm;
  /** Initial feed loads are the only times the article surface should skeleton. */
  const isFeedListInitialLoading = loading && feed.length === 0;

  useEffect(() => {
    if (shellLoadingTimeoutRef.current !== null) {
      clearTimeout(shellLoadingTimeoutRef.current);
      shellLoadingTimeoutRef.current = null;
    }

    if (isFeedListInitialLoading) {
      setIsShellLoading(true);
      return;
    }

    shellLoadingTimeoutRef.current = setTimeout(() => {
      shellLoadingTimeoutRef.current = null;
      setIsShellLoading(false);
    }, SHELL_LOADING_SETTLE_MS);

    return () => {
      if (shellLoadingTimeoutRef.current !== null) {
        clearTimeout(shellLoadingTimeoutRef.current);
        shellLoadingTimeoutRef.current = null;
      }
    };
  }, [isFeedListInitialLoading]);
  /** Refreshes should preserve visible articles and only signal background work. */
  const isFeedListRefreshing = loading && feed.length > 0;
  const articleCallbacks = useDashboardArticleCallbacks({
    articleFilter,
    capturePreExpandSnapshot,
    handleArticleToggle: (article) => {
      void handleArticleToggle(article);
    },
    handleExpandedSwipeRead: (article) => {
      void handleExpandedSwipeRead(article);
    },
    handleSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
    selectedCategory,
  });

  useEffect(() => {
    isLoadingMoreArticlesRef.current = false;
    isAwaitingArticleWindowSettlementRef.current = shouldUseArticleWindow;
    allowPartialArticleWindowGrowthRef.current = false;
    previousAwaitedFeedLengthRef.current = 0;
    hasStartedArticleWindowSettlementRef.current = false;
    isRefillingDepletedUnreadWindowRef.current = false;
    lastPrefetchedLimitRef.current = 0;
    setIsLoadingMoreArticles(false);
    setRequestedArticleLimit(articlesPerPage);
    setHasMoreServerArticles(shouldUseArticleWindow);
  }, [articleFilter, articlesPerPage, selectedCategory, shouldUseArticleWindow]);

  useEffect(() => {
    if (shouldUseArticleWindow && loading) {
      isAwaitingArticleWindowSettlementRef.current = true;
      hasStartedArticleWindowSettlementRef.current = true;
    }
  }, [loading, shouldUseArticleWindow]);

  useEffect(() => {
    const nextAvailability = resolveArticleWindowAvailability({
      allowPartialFeedGrowth: allowPartialArticleWindowGrowthRef.current,
      currentFeedLength: feed.length,
      hasStartedAwaitedWindowSettlement:
        hasStartedArticleWindowSettlementRef.current,
      isAwaitingWindowSettlement:
        isAwaitingArticleWindowSettlementRef.current,
      isLoading: loading,
      previousFeedLength: previousAwaitedFeedLengthRef.current,
      previousHasMoreServerArticles: hasMoreServerArticles,
      requestedArticleLimit,
      shouldUseArticleWindow,
    });

    if (nextAvailability.shouldClearAwaitingWindowSettlement) {
      isAwaitingArticleWindowSettlementRef.current = false;
      allowPartialArticleWindowGrowthRef.current = false;
      hasStartedArticleWindowSettlementRef.current = false;
    }

    if (!shouldUseArticleWindow) {
      isLoadingMoreArticlesRef.current = false;
      setIsLoadingMoreArticles(false);
    }

    if (nextAvailability.hasMoreServerArticles !== hasMoreServerArticles) {
      setHasMoreServerArticles(nextAvailability.hasMoreServerArticles);
    }

    if (
      isLoadingMoreArticlesRef.current &&
      !loading &&
      !isAwaitingArticleWindowSettlementRef.current
    ) {
      isLoadingMoreArticlesRef.current = false;
      setIsLoadingMoreArticles(false);
    }
  }, [feed.length, hasMoreServerArticles, loading, requestedArticleLimit, shouldUseArticleWindow]);

  const articleWindowLimit = shouldUseArticleWindow
    ? requestedArticleLimit
    : undefined;

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
        collapsingArticleKeys: Object.keys(collapsingArticles),
        customCategoryLabels,
        expandedArticleKey,
        feed,
        orderedCategoryLabels,
        searchTerm: deferredSearchTerm,
        selectedCategory,
      }),
    [
      categories,
      collapsingArticles,
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
  // Group dashboard side effects behind a single hook so the controller stays
  // focused on state composition and event wiring.
  useDashboardEffects({
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasInitializedDashboardRef,
    initialArticleLimit: articleWindowLimit,
    isSearchPending,
    isShellLoading,
    loadFeedSources,
    loading,
    loadingEpoch,
    onTimeout: cancelPendingRequest,
    searchTerm,
    selectedCategory,
    selectedFeed,
    setIsCategoriesLoading,
    setIsSidebarVisible,
    setLoading,
    setSelectedCategory,
    timeoutMs: FEED_LOADING_FAILSAFE_MS,
  });

  // Keep persisted category ordering aligned with the currently available set of
  // labels without discarding user-defined order for still-present categories.
  //
  // Including `orderedCategoryLabels` in the dependency array ensures that an
  // out-of-band update (e.g. the server-loaded category order arriving after
  // feed sources have already been reconciled) triggers a follow-up
  // reconciliation pass. The element-wise bail-out inside the functional
  // updater prevents infinite re-render cycles: when the reconciled result
  // matches the current state, the same array reference is returned so React
  // skips the update entirely.
  //
  // Reconciliation is skipped while `categories` still points at the
  // placeholder `INITIAL_CATEGORIES` tree — running against the placeholder
  // would overwrite a server-loaded order with a meaningless default and
  // could persist that default back to the server.
  useEffect(() => {
    if (categories === INITIAL_CATEGORIES) {
      return;
    }

    setOrderedCategoryLabels((currentLabels) => {
      const nextLabels = computeNextOrderedCategoryLabels(
        categories,
        customCategoryLabels,
        currentLabels,
      );

      if (
        nextLabels.length === currentLabels.length &&
        nextLabels.every((label, index) => label === currentLabels[index])
      ) {
        return currentLabels;
      }

      return nextLabels;
    });
  }, [categories, customCategoryLabels, orderedCategoryLabels, setOrderedCategoryLabels]);

  const previousSelectedCategoryRef = useRef(selectedCategory);
  const previousArticleFilterRef = useRef(articleFilter);
  const appliedBatchArticleFilterRef = useRef(articleFilter);

  useEffect(() => {
    if (
      previousSelectedCategoryRef.current !== selectedCategory ||
      previousArticleFilterRef.current !== articleFilter
    ) {
      setExpandedArticleKey(null);
    }

    previousSelectedCategoryRef.current = selectedCategory;
    previousArticleFilterRef.current = articleFilter;
  }, [articleFilter, selectedCategory, setExpandedArticleKey]);

  useEffect(() => {
    if (!hasInitializedDashboardRef.current) {
      appliedBatchArticleFilterRef.current = articleFilter;
      return;
    }

    if (appliedBatchArticleFilterRef.current === articleFilter) {
      return;
    }

    appliedBatchArticleFilterRef.current = articleFilter;

    if (usePlaceholderData) {
      return;
    }

    void refreshCurrentSelection({
      articleLimit: articleWindowLimit,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      keepExistingFeed: false,
      requestSource: "article-filter-change",
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
      skipRefresh: true,
    });
  }, [
    articleFilter,
    articleWindowLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasInitializedDashboardRef,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    usePlaceholderData,
  ]);

  const {
    autoRefreshFeedList,
    handleCategoryClick,
    handleCategoryPrefetch,
    handleFeedClick,
    handleFeedPrefetch,
    handleRefreshSelection,
  } = useDashboardHandlers({
    articleLimit: articleWindowLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    prefetchFeed,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    setIsMobileSidebarOpen,
    setSelectedCategory,
  });

  /**
   * Wraps the background auto-refresh to show toolbar skeletons and the filter-bar
   * loading indicator during the refresh, identical to a manual refresh UX.
   * A ref guard prevents re-entrant calls from the interval tick.
   */
  const wrappedAutoRefreshFeedList = useCallback(async () => {
    if (isAutoRefreshingRef.current) return;
    isAutoRefreshingRef.current = true;
    setIsAutoRefreshing(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_START));
    try {
      await autoRefreshFeedList();
    } finally {
      isAutoRefreshingRef.current = false;
      setIsAutoRefreshing(false);
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_END));
    }
  }, [autoRefreshFeedList]);

  /**
   * Warms the TanStack Query cache for the next page of articles so the
   * subsequent load-more resolves from cache instead of waiting on a network
   * round-trip.  The prefetch mirrors the exact options used by
   * `handleLoadMoreArticles` so the cache key matches on first lookup.
   *
   * This is strictly best-effort: if the cache expires before the user scrolls
   * to the threshold (e.g. auto-refresh fires between prefetch and use), the
   * load-more falls back to a normal server fetch transparently.
   */
  const prefetchNextPageForCurrentSelection = useCallback(
    async (nextLimit: number) => {
      if (usePlaceholderData) {
        return;
      }

      const prefetchOptions = {
        articleLimit: nextLimit,
        keepExistingFeed: true,
        requestSource: "feed-scroll-load-more" as const,
        skipRefresh: true,
      };

      if (selectedCategory === ALL_FEEDS_NODE_KEY) {
        await prefetchAllFeeds(undefined, prefetchOptions);
        return;
      }

      if (selectedFeedUrl) {
        await prefetchFeed(selectedFeedUrl, prefetchOptions);
        return;
      }

      if (selectedCategoryNode) {
        await prefetchCategoryFeeds(selectedCategoryNode, prefetchOptions);
      }
    },
    [
      prefetchAllFeeds,
      prefetchCategoryFeeds,
      prefetchFeed,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
      usePlaceholderData,
    ],
  );

  const handleLoadMoreArticles = useCallback(() => {
    if (shouldBlockArticleWindowLoadMore({
      currentFeedLength: feed.length,
      hasMoreServerArticles,
      isCategoriesLoading,
      isLoadingMoreArticles: isLoadingMoreArticlesRef.current,
      shouldUseArticleWindow,
    })) {
      return;
    }

    const nextArticleLimit =
      requestedArticleLimit + articlesPerPage * serverLoadMorePageBatch;
    const nextPrefetchLimit = nextArticleLimit + articlesPerPage;
    isLoadingMoreArticlesRef.current = true;
    isAwaitingArticleWindowSettlementRef.current = true;
    allowPartialArticleWindowGrowthRef.current = true;
    previousAwaitedFeedLengthRef.current = feed.length;
    hasStartedArticleWindowSettlementRef.current = true;

    // Schedule the fetch on the next frame so React can commit the loading
    // rows before a warm-cache response settles.
    setIsLoadingMoreArticles(true);
    setRequestedArticleLimit(nextArticleLimit);

    if (lastPrefetchedLimitRef.current < nextPrefetchLimit) {
      lastPrefetchedLimitRef.current = nextPrefetchLimit;
      void prefetchNextPageForCurrentSelection(nextPrefetchLimit);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void refreshCurrentSelection({
          articleLimit: nextArticleLimit,
          fetchAllFeeds,
          fetchCategoryFeeds,
          fetchFeed,
          keepExistingFeed: true,
          requestSource: "feed-scroll-load-more",
          selectedCategory,
          selectedCategoryNode,
          selectedFeedUrl,
          skipRefresh: true,
        })
          .catch(() => {
            setRequestedArticleLimit((currentLimit) =>
              currentLimit === nextArticleLimit
                ? Math.max(
                    articlesPerPage,
                    currentLimit - articlesPerPage * serverLoadMorePageBatch,
                  )
                : currentLimit,
            );
          })
          .finally(() => {
            isLoadingMoreArticlesRef.current = false;
            setIsLoadingMoreArticles(false);
          });
      });
    });
  }, [
    articlesPerPage,
    feed.length,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasMoreServerArticles,
    isCategoriesLoading,
    prefetchNextPageForCurrentSelection,
    requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    serverLoadMorePageBatch,
    shouldUseArticleWindow,
  ]);

  /** Cancels stale foreground requests and clears cached query errors after a long tab suspension. */
  const handleStaleTabResume = useCallback(() => {
    cancelPendingRequest();
  }, [cancelPendingRequest]);

  /**
   * Proactively pre-warms the next page in the TanStack Query cache the moment
   * the current page finishes loading.  When the user scrolls to the threshold,
   * `handleLoadMoreArticles` → `refreshCurrentSelection` hits the warm cache and
   * resolves synchronously — the next page zips in with no visible latency.
   * After each load-more the effect fires again to keep exactly one page buffered
   * ahead at all times.
   */
  useEffect(() => {
    if (!shouldUseArticleWindow || loading || !hasMoreServerArticles) {
      return;
    }

    const nextLimit = requestedArticleLimit + articlesPerPage;
    if (lastPrefetchedLimitRef.current >= nextLimit) {
      return;
    }

    lastPrefetchedLimitRef.current = nextLimit;
    void prefetchNextPageForCurrentSelection(nextLimit);
  }, [
    articlesPerPage,
    hasMoreServerArticles,
    loading,
    prefetchNextPageForCurrentSelection,
    requestedArticleLimit,
    shouldUseArticleWindow,
  ]);

  const pendingLoadMoreArticleCount =
    shouldUseArticleWindow && isLoadingMoreArticles
      ? Math.max(0, requestedArticleLimit - feed.length)
      : 0;

  useEffect(() => {
    if (
      !shouldRefillDepletedUnreadWindow({
        articleFilter,
        articlesPerPage,
        currentFeedLength: feed.length,
        currentFilteredFeedLength: filteredFeed.length,
        hasMoreServerArticles,
        isLoading: loading,
        isRefillingDepletedUnreadWindow:
          isRefillingDepletedUnreadWindowRef.current,
        shouldUseArticleWindow,
      })
    ) {
      return;
    }

    isRefillingDepletedUnreadWindowRef.current = true;
    isAwaitingArticleWindowSettlementRef.current = true;
    allowPartialArticleWindowGrowthRef.current = true;
    previousAwaitedFeedLengthRef.current = feed.length;
    hasStartedArticleWindowSettlementRef.current = true;

    void refreshCurrentSelection({
      articleLimit: requestedArticleLimit,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      requestSource: "feed-scroll-load-more",
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
      skipRefresh: true,
    }).finally(() => {
      isRefillingDepletedUnreadWindowRef.current = false;
    });
  }, [
    articleFilter,
    articlesPerPage,
    feed.length,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    filteredFeed.length,
    hasMoreServerArticles,
    loading,
    requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    shouldUseArticleWindow,
  ]);

  useDashboardIntervals({
    autoRefreshFeedList: wrappedAutoRefreshFeedList,
    autoRefreshIntervalMinutes,
    onStaleTabResume: handleStaleTabResume,
    setRelativeRefreshTick,
  });

  /** Applies an optimistic local read-state update after a successful mark-all-read action. */
  const handleMarkAllReadLocally = useCallback(() => {
    setFeed((currentFeed) =>
      currentFeed.map((article) => ({ ...article, isRead: true })),
    );
  }, [setFeed]);

  /** Marks only the articles that are fully visible inside the current feed viewport. */
  const handleMarkViewportRead = useCallback(async () => {
    const visibleUnreadArticles = collectFullyVisibleUnreadArticles(feed);

    await handleMarkArticlesRead(visibleUnreadArticles);
  }, [feed, handleMarkArticlesRead]);

  useDashboardEvents({
    onMarkAllReadLocally: handleMarkAllReadLocally,
    onMarkViewportRead: handleMarkViewportRead,
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
  const sidebarContentProps = useMemo(
    () =>
      buildDashboardSidebarContentProps({
        isCategoriesLoading,
        isSidebarVisible,
        onCategoryClick: handleCategoryClick,
        onCategoryPrefetch: handleCategoryPrefetch,
        onFeedClick: handleFeedClick,
        onFeedPrefetch: handleFeedPrefetch,
        selectedCategory,
        showFavicons,
        sidebarCategories,
      }),
    [
      handleCategoryClick,
      handleCategoryPrefetch,
      handleFeedClick,
      handleFeedPrefetch,
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
  return useMemo(
    () =>
      buildDashboardControllerState({
        feedList: {
          animatingInArticleKeys,
          articleFilter,
          articlesPerPage,
          canLoadMoreFromServer: shouldUseArticleWindow && hasMoreServerArticles,
          collapsingArticles,
          expandedArticleKey,
          feedViewKey: articleCallbacks.feedViewKey,
          filteredFeed,
          getPreExpandViewportSnapshot,
          hasConfiguredFeeds: getAllFeedNodes(categories).length > 0,
          hydratedArticleLinks,
          hydratingArticleLinks,
          isCollapseScrollRestoreActive,
          isInitialLoading: isFeedListInitialLoading,
          isLoadingMore: isLoadingMoreArticles,
          isRefreshing: isFeedListRefreshing,
          loadingMoreArticleCount: pendingLoadMoreArticleCount,
          onArticleEnteringDone: handleArticleEnteringDone,
          onArticleExpandedSwipeRead: articleCallbacks.onArticleExpandedSwipeRead,
          onArticlePrepareExpand: articleCallbacks.onArticlePrepareExpand,
          onArticleSwipeRead: articleCallbacks.onArticleSwipeRead,
          onArticleToggle: articleCallbacks.onArticleToggle,
          onArticleToggleRead: articleCallbacks.onArticleToggleRead,
          onArticleToggleStarred: articleCallbacks.onArticleToggleStarred,
          onLoadMore: shouldUseArticleWindow ? handleLoadMoreArticles : undefined,
          refreshEpoch: loadingEpoch,
          searchTerm,
          showFavicons,
          updatingArticleState,
        },
        filterBar: {
          articleFilter,
          isShellLoading,
          lastRefreshLabel,
          // Reflect both foreground-loading state and background auto-refresh state
          // so the filter bar spinner and label skeleton appear for both.
          loading: loading || isAutoRefreshing,
          setArticleFilter,
        },
        settings: {
          articlesPerPage,
          autoRefreshIntervalMinutes,
          backgroundMode,
          categories: displayCategories,
          categoryTree,
          distillStrategy,
          handleCloseSettings,
          onBackgroundModeChange,
          onDistillStrategyChange,
          selectedCategory,
          setArticlesPerPage,
          setAutoRefreshIntervalMinutes,
          setShowFavicons,
          showFavicons,
          showSettingsModal,
          usePlaceholderData,
        },
        sidebar: {
          isMobileSidebarOpen,
          isSidebarVisible,
          setIsMobileSidebarOpen,
          sidebarContentProps,
          sidebarScrollRef,
        },
      }),
    [
      animatingInArticleKeys,
      articleCallbacks.feedViewKey,
      articleCallbacks.onArticleExpandedSwipeRead,
      articleCallbacks.onArticlePrepareExpand,
      articleCallbacks.onArticleSwipeRead,
      articleCallbacks.onArticleToggle,
      articleCallbacks.onArticleToggleRead,
      articleCallbacks.onArticleToggleStarred,
      articleFilter,
      articlesPerPage,
      autoRefreshIntervalMinutes,
      backgroundMode,
      categories,
      categoryTree,
      collapsingArticles,
      displayCategories,
      distillStrategy,
      expandedArticleKey,
      filteredFeed,
      getPreExpandViewportSnapshot,
      handleArticleEnteringDone,
      handleLoadMoreArticles,
      hasMoreServerArticles,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isAutoRefreshing,
      isCollapseScrollRestoreActive,
      isFeedListInitialLoading,
      isShellLoading,
      isLoadingMoreArticles,
      pendingLoadMoreArticleCount,
      isFeedListRefreshing,
      loadingEpoch,
      isMobileSidebarOpen,
      isSidebarVisible,
      lastRefreshLabel,
      loading,
      handleCloseSettings,
      onBackgroundModeChange,
      onDistillStrategyChange,
      searchTerm,
      selectedCategory,
      setArticleFilter,
      setArticlesPerPage,
      setAutoRefreshIntervalMinutes,
      setIsMobileSidebarOpen,
      setShowFavicons,
      shouldUseArticleWindow,
      showFavicons,
      showSettingsModal,
      sidebarContentProps,
      sidebarScrollRef,
      updatingArticleState,
      usePlaceholderData,
    ],
  );
}