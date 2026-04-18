"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DashboardControllerRuntimeStateOptions,
  DashboardEffectsOptions,
  DashboardEventsOptions,
  DashboardHandlersOptions,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardControllerComposition";
import type { Article } from "@/lib/core";

import {
  useDashboardIntervals,
  useRefreshStatus,
} from "@/app/dashboard/dashboard-hooks";
import {
  useDashboardControllerEventBindings,
  useDashboardControllerRuntimeState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardControllerComposition";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { refreshCurrentSelection } from "@/app/dashboard/dashboard-services/selection";

type DashboardArticleFilter = "all" | "read" | "starred" | "unread";

type UseDashboardControllerRuntimeOptions = Omit<
  DashboardControllerRuntimeStateOptions,
  "articleLimit" | "initialArticleLimit" | "onTimeout"
> & {
  appliedBatchArticleFilterRef: React.RefObject<DashboardArticleFilter>;
  appliedBatchSearchTermRef: React.RefObject<string>;
  articleFilter: DashboardArticleFilter;
  articleWindowLimit: DashboardHandlersOptions["articleLimit"];
  autoRefreshIntervalMinutes: number;
  cancelPendingRequest: DashboardEffectsOptions["onTimeout"];
  feed: Article[];
  handleMarkArticlesRead: (articles: Article[]) => Promise<void>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setRelativeRefreshTick: ReturnType<
    typeof useDashboardControllerRefreshState
  >["setRelativeRefreshTick"];
  setSearchTerm: DashboardEventsOptions["onSearchChange"];
  setShowSettingsModal: () => void;
  usePlaceholderData: boolean;
};

export function useDashboardControllerRefreshState(
  usePlaceholderData: boolean,
) {
  return useRefreshStatus(usePlaceholderData);
}

export function useDashboardControllerRuntime(
  options: UseDashboardControllerRuntimeOptions,
) {
  const { lastRefreshLabel } = useDashboardControllerRefreshState(
    options.usePlaceholderData,
  );
  const {
    autoRefreshFeedList,
    handleCategoryClick,
    handleCategoryPrefetch,
    handleFeedClick,
    handleFeedPrefetch,
    handleRefreshSelection,
  } = useDashboardControllerRuntimeState(
    createDashboardControllerRuntimeStateOptions(options),
  );

  useDashboardArticleFilterRefresh(options);
  useDashboardSearchRefresh(options);

  const isAutoRefreshing = useDashboardAutoRefresh({
    autoRefreshFeedList,
    autoRefreshIntervalMinutes: options.autoRefreshIntervalMinutes,
    cancelPendingRequest: options.cancelPendingRequest,
    setRelativeRefreshTick: options.setRelativeRefreshTick,
  });

  useDashboardControllerEventBindings({
    feed: options.feed,
    handleMarkArticlesRead: options.handleMarkArticlesRead,
    handleRefreshSelection,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    setFeed: options.setFeed,
    setIsMobileSidebarOpen: options.setIsMobileSidebarOpen,
    setSearchTerm: options.setSearchTerm,
    setShowSettingsModal: options.setShowSettingsModal,
    usePlaceholderData: options.usePlaceholderData,
  });

  return {
    handleCategoryClick,
    handleCategoryPrefetch,
    handleFeedClick,
    handleFeedPrefetch,
    handleRefreshSelection,
    isAutoRefreshing,
    lastRefreshLabel,
  };
}

function createDashboardControllerRuntimeStateOptions(
  options: UseDashboardControllerRuntimeOptions,
) {
  return {
    articleLimit: options.articleWindowLimit,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    hasInitializedDashboardRef: options.hasInitializedDashboardRef,
    initialArticleLimit: options.articleWindowLimit,
    isSearchPending: options.isSearchPending,
    isShellLoading: options.isShellLoading,
    loadFeedSources: options.loadFeedSources,
    loading: options.loading,
    loadingEpoch: options.loadingEpoch,
    onTimeout: options.cancelPendingRequest,
    prefetchAllFeeds: options.prefetchAllFeeds,
    prefetchCategoryFeeds: options.prefetchCategoryFeeds,
    prefetchFeed: options.prefetchFeed,
    searchTerm: options.searchTerm,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeed: options.selectedFeed,
    selectedFeedUrl: options.selectedFeedUrl,
    setIsCategoriesLoading: options.setIsCategoriesLoading,
    setIsMobileSidebarOpen: options.setIsMobileSidebarOpen,
    setIsSidebarVisible: options.setIsSidebarVisible,
    setLoading: options.setLoading,
    setSelectedCategory: options.setSelectedCategory,
    timeoutMs: options.timeoutMs,
  } satisfies Parameters<typeof useDashboardControllerRuntimeState>[0];
}

function useDashboardArticleFilterRefresh(
  options: Pick<
    UseDashboardControllerRuntimeOptions,
    | "appliedBatchArticleFilterRef"
    | "articleFilter"
    | "articleWindowLimit"
    | "fetchAllFeeds"
    | "fetchCategoryFeeds"
    | "fetchFeed"
    | "hasInitializedDashboardRef"
    | "selectedCategory"
    | "selectedCategoryNode"
    | "selectedFeedUrl"
    | "usePlaceholderData"
  >,
) {
  useEffect(() => {
    if (!options.hasInitializedDashboardRef.current) {
      options.appliedBatchArticleFilterRef.current = options.articleFilter;
      return;
    }

    if (
      options.appliedBatchArticleFilterRef.current === options.articleFilter
    ) {
      return;
    }

    options.appliedBatchArticleFilterRef.current = options.articleFilter;

    if (options.usePlaceholderData) {
      return;
    }

    // Announce the filter-change fetch so the toolbar action buttons (refresh,
    // mark-all-read, visible) enter their pending state and the filter-bar
    // timestamp shows a spinner. Only these targeted elements respond to
    // REFRESH_START/END — the filter tokens and feed list are unaffected.
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_START));
    void refreshCurrentSelection({
      articleLimit: options.articleWindowLimit,
      fetchAllFeeds: options.fetchAllFeeds,
      fetchCategoryFeeds: options.fetchCategoryFeeds,
      fetchFeed: options.fetchFeed,
      keepExistingFeed: false,
      requestSource: "article-filter-change",
      selectedCategory: options.selectedCategory,
      selectedCategoryNode: options.selectedCategoryNode,
      selectedFeedUrl: options.selectedFeedUrl,
      skipRefresh: true,
    })
      .then(() => {
        window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_END));
      })
      .catch(() => {
        window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_END));
      });
  }, [options]);
}

function useDashboardAutoRefresh(options: {
  autoRefreshFeedList: () => Promise<void>;
  autoRefreshIntervalMinutes: number;
  cancelPendingRequest: DashboardEffectsOptions["onTimeout"];
  setRelativeRefreshTick: ReturnType<
    typeof useDashboardControllerRefreshState
  >["setRelativeRefreshTick"];
}) {
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const isAutoRefreshingRef = useRef(false);

  const wrappedAutoRefreshFeedList = useCallback(async () => {
    if (isAutoRefreshingRef.current) {
      return;
    }

    isAutoRefreshingRef.current = true;
    setIsAutoRefreshing(true);
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_START));

    try {
      await options.autoRefreshFeedList();
    } finally {
      isAutoRefreshingRef.current = false;
      setIsAutoRefreshing(false);
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_END));
    }
  }, [options]);

  const handleStaleTabResume = useCallback(() => {
    options.cancelPendingRequest?.();
  }, [options]);

  useDashboardIntervals({
    autoRefreshFeedList: wrappedAutoRefreshFeedList,
    autoRefreshIntervalMinutes: options.autoRefreshIntervalMinutes,
    onStaleTabResume: handleStaleTabResume,
    setRelativeRefreshTick: options.setRelativeRefreshTick,
  });

  return isAutoRefreshing;
}

/**
 * Debounce delay (ms) before issuing a server search after the user stops
 * typing.  The O(n) client-side WeakMap filter provides immediate feedback on
 * every keystroke; this delay keeps the server fetch rate reasonable.
 */
const SEARCH_DEBOUNCE_MS = 300;

function useDashboardSearchRefresh(
  options: Pick<
    UseDashboardControllerRuntimeOptions,
    | "appliedBatchSearchTermRef"
    | "articleWindowLimit"
    | "fetchAllFeeds"
    | "fetchCategoryFeeds"
    | "fetchFeed"
    | "hasInitializedDashboardRef"
    | "searchTerm"
    | "selectedCategory"
    | "selectedCategoryNode"
    | "selectedFeedUrl"
    | "usePlaceholderData"
  >,
) {
  const debounceRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const normalizedSearchTerm = options.searchTerm.trim();
    if (!options.hasInitializedDashboardRef.current) {
      options.appliedBatchSearchTermRef.current = normalizedSearchTerm;
      return;
    }

    if (options.appliedBatchSearchTermRef.current === normalizedSearchTerm) {
      return;
    }

    // Cancel any in-flight debounce before scheduling a new one so rapid
    // typing only triggers one server fetch 300 ms after the last keystroke.
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    const pendingTerm = normalizedSearchTerm;

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;

      // Guard: another effect run may have already applied this term.
      if (options.appliedBatchSearchTermRef.current === pendingTerm) {
        return;
      }

      options.appliedBatchSearchTermRef.current = pendingTerm;

      if (options.usePlaceholderData) {
        return;
      }

      // keepExistingFeed: true keeps the current (client-filtered) articles
      // visible while the server resolves the fresh search result set.
      // The feed is replaced in-place once the response arrives, with no
      // intermediate empty state, so isShellLoading never fires.
      void refreshCurrentSelection({
        articleLimit: options.articleWindowLimit,
        fetchAllFeeds: options.fetchAllFeeds,
        fetchCategoryFeeds: options.fetchCategoryFeeds,
        fetchFeed: options.fetchFeed,
        keepExistingFeed: true,
        requestSource: "search-change",
        searchTerm: pendingTerm,
        selectedCategory: options.selectedCategory,
        selectedCategoryNode: options.selectedCategoryNode,
        selectedFeedUrl: options.selectedFeedUrl,
        skipRefresh: true,
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [options]);
}
