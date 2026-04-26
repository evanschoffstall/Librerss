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
type DashboardArticleSortOrder = "newest" | "oldest";
interface DashboardAutoRefreshOptions {
  autoRefreshFeedList: () => Promise<void>;
  autoRefreshIntervalMinutes: number;
  cancelPendingRequest: DashboardEffectsOptions["onTimeout"];
  setRelativeRefreshTick: ReturnType<
    typeof useDashboardControllerRefreshState
  >["setRelativeRefreshTick"];
}

interface DashboardSelectionRefreshOptions<TValue> {
  appliedValueRef: React.RefObject<TValue>;
  articleWindowLimit: DashboardHandlersOptions["articleLimit"];
  currentValue: TValue;
  fetchAllFeeds: UseDashboardControllerRuntimeOptions["fetchAllFeeds"];
  fetchCategoryFeeds: UseDashboardControllerRuntimeOptions["fetchCategoryFeeds"];
  fetchFeed: UseDashboardControllerRuntimeOptions["fetchFeed"];
  hasInitializedDashboardRef: UseDashboardControllerRuntimeOptions["hasInitializedDashboardRef"];
  requestSource: DashboardSelectionRefreshRequestSource;
  selectedCategory: UseDashboardControllerRuntimeOptions["selectedCategory"];
  selectedCategoryNode: UseDashboardControllerRuntimeOptions["selectedCategoryNode"];
  selectedFeedUrl: UseDashboardControllerRuntimeOptions["selectedFeedUrl"];
  usePlaceholderData: boolean;
}

type DashboardSelectionRefreshRequestSource =
  | "article-filter-change"
  | "article-sort-order-change";

type UseDashboardControllerRuntimeOptions = Omit<
  DashboardControllerRuntimeStateOptions,
  "articleLimit" | "initialArticleLimit" | "onTimeout"
> & {
  appliedBatchArticleFilterRef: React.RefObject<DashboardArticleFilter>;
  appliedBatchArticleSortOrderRef: React.RefObject<DashboardArticleSortOrder>;
  appliedBatchSearchTermRef: React.RefObject<string>;
  articleFilter: DashboardArticleFilter;
  articleSortOrder: DashboardArticleSortOrder;
  articleWindowLimit: DashboardHandlersOptions["articleLimit"];
  autoRefreshIntervalMinutes: number;
  cancelPendingRequest: DashboardEffectsOptions["onTimeout"];
  feed: Article[];
  handleMarkArticlesRead: (articles: Article[]) => Promise<void>;
  selectionArticleLimit: DashboardHandlersOptions["selectionArticleLimit"];
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setRelativeRefreshTick: ReturnType<
    typeof useDashboardControllerRefreshState
  >["setRelativeRefreshTick"];
  setSearchTerm: DashboardEventsOptions["onSearchChange"];
  setShowSettingsModal: () => void;
  usePlaceholderData: boolean;
};

/**
 * Manage the dashboard controller refresh state.
 * @param usePlaceholderData - The placeholder data.
 * @returns The dashboard controller refresh state state and callbacks.
 */
export function useDashboardControllerRefreshState(
  usePlaceholderData: boolean,
) {
  return useRefreshStatus(usePlaceholderData);
}

/**
 * Manage the dashboard controller runtime.
 * @param options - The options used to manage the dashboard controller runtime.
 * @returns The dashboard controller runtime state and callbacks.
 */
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
  useDashboardArticleSortOrderRefresh(options);
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

/**
 * Create the dashboard controller runtime state options.
 * @param options - The options used to create the dashboard controller runtime state options.
 * @returns The dashboard controller runtime state options.
 */
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
    selectionArticleLimit: options.selectionArticleLimit,
    setIsCategoriesLoading: options.setIsCategoriesLoading,
    setIsMobileSidebarOpen: options.setIsMobileSidebarOpen,
    setIsSidebarVisible: options.setIsSidebarVisible,
    setLoading: options.setLoading,
    setSelectedCategory: options.setSelectedCategory,
    timeoutMs: options.timeoutMs,
  } satisfies Parameters<typeof useDashboardControllerRuntimeState>[0];
}

/**
 * Run a selection refresh while advertising toolbar-scoped pending state.
 * @param options - The current selection refresh inputs.
 * @returns A promise that settles after the refresh end event is dispatched.
 */
async function runDashboardSelectionRefresh(
  options: Omit<
    DashboardSelectionRefreshOptions<unknown>,
    "appliedValueRef" | "currentValue"
  >,
) {
  window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_START));

  try {
    await refreshCurrentSelection({
      articleLimit: options.articleWindowLimit,
      fetchAllFeeds: options.fetchAllFeeds,
      fetchCategoryFeeds: options.fetchCategoryFeeds,
      fetchFeed: options.fetchFeed,
      keepExistingFeed: false,
      requestSource: options.requestSource,
      selectedCategory: options.selectedCategory,
      selectedCategoryNode: options.selectedCategoryNode,
      selectedFeedUrl: options.selectedFeedUrl,
      skipRefresh: true,
    });
  } finally {
    window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_END));
  }
}

/**
 * Manage the dashboard article filter refresh.
 * @param options - The options used to manage the dashboard article filter refresh.
 */
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
  useDashboardSelectionRefreshOnChange({
    appliedValueRef: options.appliedBatchArticleFilterRef,
    articleWindowLimit: options.articleWindowLimit,
    currentValue: options.articleFilter,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    hasInitializedDashboardRef: options.hasInitializedDashboardRef,
    requestSource: "article-filter-change",
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    usePlaceholderData: options.usePlaceholderData,
  });
}
/**
 * Trigger a server-side refetch when the article sort order changes so the
 * database query order mirrors the user's preference.
 * @param options - The options used to manage the dashboard article sort order refresh.
 */
function useDashboardArticleSortOrderRefresh(
  options: Pick<
    UseDashboardControllerRuntimeOptions,
    | "appliedBatchArticleSortOrderRef"
    | "articleSortOrder"
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
  useDashboardSelectionRefreshOnChange({
    appliedValueRef: options.appliedBatchArticleSortOrderRef,
    articleWindowLimit: options.articleWindowLimit,
    currentValue: options.articleSortOrder,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    hasInitializedDashboardRef: options.hasInitializedDashboardRef,
    requestSource: "article-sort-order-change",
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    usePlaceholderData: options.usePlaceholderData,
  });
}

/**
 * Manage the dashboard auto refresh.
 * @param options - The options used to manage the dashboard auto refresh.
 * @returns Whether dashboard auto refresh.
 */
function useDashboardAutoRefresh(options: DashboardAutoRefreshOptions) {
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
 * Refresh the current selection whenever a server-owned selection input changes.
 * @param options - The tracked selection value and refresh dependencies.
 */
function useDashboardSelectionRefreshOnChange<TValue>(
  options: DashboardSelectionRefreshOptions<TValue>,
) {
  useEffect(() => {
    if (!options.hasInitializedDashboardRef.current) {
      options.appliedValueRef.current = options.currentValue;
      return;
    }

    if (options.appliedValueRef.current === options.currentValue) {
      return;
    }

    options.appliedValueRef.current = options.currentValue;

    if (options.usePlaceholderData) {
      return;
    }

    void runDashboardSelectionRefresh({
      articleWindowLimit: options.articleWindowLimit,
      fetchAllFeeds: options.fetchAllFeeds,
      fetchCategoryFeeds: options.fetchCategoryFeeds,
      fetchFeed: options.fetchFeed,
      hasInitializedDashboardRef: options.hasInitializedDashboardRef,
      requestSource: options.requestSource,
      selectedCategory: options.selectedCategory,
      selectedCategoryNode: options.selectedCategoryNode,
      selectedFeedUrl: options.selectedFeedUrl,
      usePlaceholderData: options.usePlaceholderData,
    });
  }, [options]);
}

/**
 * Debounce delay (ms) before issuing a server search after the user stops
 * typing.  The O(n) client-side WeakMap filter provides immediate feedback on
 * every keystroke; this delay keeps the server fetch rate reasonable.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Manage the dashboard search refresh.
 * @param options - The options used to manage the dashboard search refresh.
 */
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
