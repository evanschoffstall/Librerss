"use client";

import { useEffect, useRef } from "react";

import type {
  DashboardControllerRuntimeStateOptions,
  DashboardEffectsOptions,
  DashboardEventsOptions,
  DashboardHandlersOptions,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardControllerComposition";
import type { Article } from "@/lib/core";

import { useRefreshStatus } from "@/app/dashboard/dashboard-hooks";
import {
  useDashboardControllerEventBindings,
  useDashboardControllerRuntimeState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardControllerComposition";
import { useDashboardAutoRefresh } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardAutoRefresh";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { refreshCurrentSelection } from "@/app/dashboard/dashboard-services/selection";

/**
 * Defines the dashboard article filter type.
 */
type DashboardArticleFilter = "all" | "read" | "starred" | "unread";
/**
 * Defines the dashboard article sort order type.
 */
type DashboardArticleSortOrder = "newest" | "oldest";
/**
 * Dashboard search refresh inputs plus mutable refs owned by the debounce hook.
 */
interface DashboardSearchDebounceOptions extends DashboardSearchRefreshOptions {
  debounceRef: React.RefObject<null | ReturnType<typeof setTimeout>>;
  latestSearchTermRef: React.RefObject<string>;
}

/**
 * Dashboard inputs required to refresh the server-backed search window.
 */
type DashboardSearchRefreshOptions = Pick<
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
>;

/**
 * Inputs used to choose the first server article-window size after a filter or
 * sort selection changes.
 */
interface DashboardSelectionRefreshLimitOptions {
  /** One-page article count owned by reader settings for reset selection reads. */
  selectionArticleLimit: DashboardHandlersOptions["selectionArticleLimit"];
}

/**
 * Describes the options for dashboard selection refresh.
 */
interface DashboardSelectionRefreshOptions<TValue> {
  appliedValueRef: React.RefObject<TValue>;
  currentValue: TValue;
  fetchAllFeeds: UseDashboardControllerRuntimeOptions["fetchAllFeeds"];
  fetchCategoryFeeds: UseDashboardControllerRuntimeOptions["fetchCategoryFeeds"];
  fetchFeed: UseDashboardControllerRuntimeOptions["fetchFeed"];
  hasInitializedDashboardRef: UseDashboardControllerRuntimeOptions["hasInitializedDashboardRef"];
  requestSource: DashboardSelectionRefreshRequestSource;
  selectedCategory: UseDashboardControllerRuntimeOptions["selectedCategory"];
  selectedCategoryNode: UseDashboardControllerRuntimeOptions["selectedCategoryNode"];
  selectedFeedUrl: UseDashboardControllerRuntimeOptions["selectedFeedUrl"];
  selectionArticleLimit: DashboardHandlersOptions["selectionArticleLimit"];
  usePlaceholderData: boolean;
}

/**
 * Defines the dashboard selection refresh request source type.
 */
type DashboardSelectionRefreshRequestSource =
  | "article-filter-change"
  | "article-sort-order-change";

/**
 * Describes the options for use dashboard controller runtime.
 */
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
  cancelPendingArticleStatusMutations?: () => void;
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
 * Resolve the article-window limit for server-backed article filter and sort
 * changes.
 *
 * Filter and sort changes reset the article window in a sibling effect during
 * the same React commit. Reading the expanded `articleWindowLimit` here would
 * let a previously scrolled feed over-fetch the next DB query before the reset
 * render lands. The selection limit is the canonical one-page value and matches
 * category/feed selection changes.
 * @param options - The reader selection settings for the reset request.
 * @returns The one-page article limit to send with the selection refresh.
 */
export function resolveDashboardSelectionRefreshArticleLimit(
  options: DashboardSelectionRefreshLimitOptions,
) {
  return options.selectionArticleLimit;
}

/**
 * Manage the dashboard controller refresh state.
 * @param usePlaceholderData - The placeholder data.
 * @returns The dashboard controller refresh state and callbacks.
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
    autoRefreshTimeoutMs: options.timeoutMs,
    cancelPendingArticleStatusMutations:
      options.cancelPendingArticleStatusMutations,
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
    hasHydratedPersistedPreferences: options.hasHydratedPersistedPreferences,
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
      articleLimit: resolveDashboardSelectionRefreshArticleLimit({
        selectionArticleLimit: options.selectionArticleLimit,
      }),
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
    | "fetchAllFeeds"
    | "fetchCategoryFeeds"
    | "fetchFeed"
    | "hasInitializedDashboardRef"
    | "selectedCategory"
    | "selectedCategoryNode"
    | "selectedFeedUrl"
    | "selectionArticleLimit"
    | "usePlaceholderData"
  >,
) {
  useDashboardSelectionRefreshOnChange({
    appliedValueRef: options.appliedBatchArticleFilterRef,
    currentValue: options.articleFilter,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    hasInitializedDashboardRef: options.hasInitializedDashboardRef,
    requestSource: "article-filter-change",
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    selectionArticleLimit: options.selectionArticleLimit,
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
    | "fetchAllFeeds"
    | "fetchCategoryFeeds"
    | "fetchFeed"
    | "hasInitializedDashboardRef"
    | "selectedCategory"
    | "selectedCategoryNode"
    | "selectedFeedUrl"
    | "selectionArticleLimit"
    | "usePlaceholderData"
  >,
) {
  useDashboardSelectionRefreshOnChange({
    appliedValueRef: options.appliedBatchArticleSortOrderRef,
    currentValue: options.articleSortOrder,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    hasInitializedDashboardRef: options.hasInitializedDashboardRef,
    requestSource: "article-sort-order-change",
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    selectionArticleLimit: options.selectionArticleLimit,
    usePlaceholderData: options.usePlaceholderData,
  });
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
      fetchAllFeeds: options.fetchAllFeeds,
      fetchCategoryFeeds: options.fetchCategoryFeeds,
      fetchFeed: options.fetchFeed,
      hasInitializedDashboardRef: options.hasInitializedDashboardRef,
      requestSource: options.requestSource,
      selectedCategory: options.selectedCategory,
      selectedCategoryNode: options.selectedCategoryNode,
      selectedFeedUrl: options.selectedFeedUrl,
      selectionArticleLimit: options.selectionArticleLimit,
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
 * Clears a pending dashboard search debounce and marks the timer ref idle.
 * @param debounceRef - Mutable timer ref owned by the search refresh hook.
 */
function clearDashboardSearchDebounce(
  debounceRef: React.RefObject<null | ReturnType<typeof setTimeout>>,
) {
  if (debounceRef.current === null) {
    return;
  }

  clearTimeout(debounceRef.current);
  debounceRef.current = null;
}

/**
 * Commits the latest debounced search term if no newer keystroke replaced it.
 * @param options - Search refresh inputs captured for this debounce.
 * @param pendingTerm - Trimmed term scheduled by the debounce.
 */
function commitDebouncedDashboardSearch(
  options: DashboardSearchDebounceOptions,
  pendingTerm: string,
) {
  if (options.latestSearchTermRef.current !== pendingTerm) {
    return;
  }

  options.appliedBatchSearchTermRef.current = pendingTerm;
  runDashboardSearchRefresh(options, pendingTerm);
}

/**
 * Refreshes the current dashboard selection for a committed server search term.
 * @param options - Current dashboard selection and fetch callbacks.
 * @param searchTerm - Trimmed search term that survived the debounce window.
 */
function runDashboardSearchRefresh(
  options: DashboardSearchRefreshOptions,
  searchTerm: string,
) {
  if (options.usePlaceholderData) {
    return;
  }

  void refreshCurrentSelection({
    articleLimit: options.articleWindowLimit,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    keepExistingFeed: true,
    requestSource: "search-change",
    searchTerm,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    skipRefresh: true,
  });
}

/**
 * Schedules the debounced server refresh for the current dashboard search term.
 * @param options - Search term, selection state, and mutable debounce refs.
 * @returns Cleanup callback that cancels the pending debounce when inputs change.
 */
function scheduleDashboardSearchDebounce(
  options: DashboardSearchDebounceOptions,
) {
  const normalizedSearchTerm = options.searchTerm.trim();
  options.latestSearchTermRef.current = normalizedSearchTerm;
  if (!shouldScheduleDashboardSearchRefresh(options, normalizedSearchTerm)) {
    return;
  }

  clearDashboardSearchDebounce(options.debounceRef);

  options.debounceRef.current = setTimeout(() => {
    options.debounceRef.current = null;
    commitDebouncedDashboardSearch(options, normalizedSearchTerm);
  }, SEARCH_DEBOUNCE_MS);

  return () => {
    clearDashboardSearchDebounce(options.debounceRef);
  };
}

/**
 * Returns whether the current search term needs a server refresh debounce.
 * @param options - Current dashboard search refresh inputs.
 * @param normalizedSearchTerm - Trimmed search term from the current render.
 * @returns Whether a debounce should be scheduled.
 */
function shouldScheduleDashboardSearchRefresh(
  options: DashboardSearchDebounceOptions,
  normalizedSearchTerm: string,
) {
  return (
    options.hasInitializedDashboardRef.current &&
    options.appliedBatchSearchTermRef.current !== normalizedSearchTerm
  );
}

/**
 * Manage the dashboard search refresh.
 * @param options - The options used to manage the dashboard search refresh.
 */
function useDashboardSearchRefresh(options: DashboardSearchRefreshOptions) {
  const {
    appliedBatchSearchTermRef,
    articleWindowLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasInitializedDashboardRef,
    searchTerm,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    usePlaceholderData,
  } = options;
  const debounceRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const latestSearchTermRef = useRef(searchTerm.trim());

  useEffect(
    () =>
      scheduleDashboardSearchDebounce({
        appliedBatchSearchTermRef,
        articleWindowLimit,
        debounceRef,
        fetchAllFeeds,
        fetchCategoryFeeds,
        fetchFeed,
        hasInitializedDashboardRef,
        latestSearchTermRef,
        searchTerm,
        selectedCategory,
        selectedCategoryNode,
        selectedFeedUrl,
        usePlaceholderData,
      }),
    [
      appliedBatchSearchTermRef,
      articleWindowLimit,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      hasInitializedDashboardRef,
      searchTerm,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
      usePlaceholderData,
    ],
  );
}
