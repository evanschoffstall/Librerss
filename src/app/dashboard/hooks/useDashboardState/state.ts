"use client";

import {
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Article } from "@/lib/core";

import {
  DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
  DASHBOARD_ARTICLE_SORT_ORDER_STORAGE_KEY,
  DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
  DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
  normalizeAutoRefreshIntervalMinutes,
  resolveDefaultAutoRefreshIntervalMinutes,
} from "@/app/dashboard/services";
import {
  type ArticleFilter,
  type ArticleSortOrder,
} from "@/app/dashboard/services/article";
import {
  ALL_FEEDS_NODE_KEY,
  INITIAL_CATEGORIES,
} from "@/app/dashboard/services/dashboard-constants";
import { clientFeedCacheTtlMinutes } from "@/lib/config";
import { useLocalStorage } from "@/lib/hooks";

/**
 * Manage the dashboard state.
 * @returns The dashboard state and callbacks.
 */
export function useDashboardState() {
  const persistentState = useDashboardPersistentState();
  const transientState = useDashboardTransientState();

  return {
    ...persistentState,
    ...transientState,
  };
}

/**
 * Manage the dashboard auto refresh state.
 * @param defaultAutoRefreshIntervalMinutes - The default auto refresh interval minutes.
 * @returns The dashboard auto refresh state and callbacks.
 */
function useDashboardAutoRefreshState(
  defaultAutoRefreshIntervalMinutes: number,
) {
  const [autoRefreshIntervalMinutes, setAutoRefreshIntervalMinutesState] =
    useState(() =>
      normalizeAutoRefreshIntervalMinutes(
        defaultAutoRefreshIntervalMinutes,
        defaultAutoRefreshIntervalMinutes,
      ),
    );

  useEffect(() => {
    setAutoRefreshIntervalMinutesState((currentValue) =>
      normalizeAutoRefreshIntervalMinutes(
        currentValue,
        defaultAutoRefreshIntervalMinutes,
      ),
    );
  }, [defaultAutoRefreshIntervalMinutes]);

  const setAutoRefreshIntervalMinutes = useCallback(
    (value: SetStateAction<number>) => {
      setAutoRefreshIntervalMinutesState((currentValue) => {
        const normalizedCurrent = normalizeAutoRefreshIntervalMinutes(
          currentValue,
          defaultAutoRefreshIntervalMinutes,
        );
        const nextValue =
          typeof value === "function" ? value(normalizedCurrent) : value;

        return normalizeAutoRefreshIntervalMinutes(
          nextValue,
          defaultAutoRefreshIntervalMinutes,
        );
      });
    },
    [defaultAutoRefreshIntervalMinutes],
  );

  return {
    autoRefreshIntervalMinutes,
    setAutoRefreshIntervalMinutes,
  };
}

/**
 * Manage the dashboard persisted preferences.
 * @returns The dashboard persisted preferences state and callbacks.
 */
function useDashboardPersistedPreferences() {
  const [selectedCategory, setSelectedCategory] = useLocalStorage(
    DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
    ALL_FEEDS_NODE_KEY,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedArticleKey, setExpandedArticleKey] = useState<null | string>(
    null,
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [articleFilter, setArticleFilter] = useLocalStorage<ArticleFilter>(
    DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
    "unread",
  );
  const [articleSortOrder, setArticleSortOrder] =
    useLocalStorage<ArticleSortOrder>(
      DASHBOARD_ARTICLE_SORT_ORDER_STORAGE_KEY,
      "newest",
    );
  const [showFavicons, setShowFavicons] = useState(true);
  const [articlesPerPage, setArticlesPerPage] = useLocalStorage(
    DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
    12,
  );
  const [hasHydratedPersistedPreferences, setHasHydratedPersistedPreferences] =
    useState(false);

  useLayoutEffect(() => {
    setHasHydratedPersistedPreferences(true);
  }, []);

  return {
    articleFilter,
    articleSortOrder,
    articlesPerPage,
    expandedArticleKey,
    hasHydratedPersistedPreferences,
    isMobileSidebarOpen,
    searchTerm,
    selectedCategory,
    setArticleFilter,
    setArticleSortOrder,
    setArticlesPerPage,
    setExpandedArticleKey,
    setIsMobileSidebarOpen,
    setSearchTerm,
    setSelectedCategory,
    setShowFavicons,
    setShowSettingsModal,
    showFavicons,
    showSettingsModal,
  };
}

/**
 * Manage the dashboard persistent state.
 * @returns The dashboard persistent state and callbacks.
 */
function useDashboardPersistentState() {
  const defaultAutoRefreshIntervalMinutes =
    resolveDefaultAutoRefreshIntervalMinutes(clientFeedCacheTtlMinutes());
  const persistedPreferences = useDashboardPersistedPreferences();
  const autoRefreshState = useDashboardAutoRefreshState(
    defaultAutoRefreshIntervalMinutes,
  );

  return {
    ...persistedPreferences,
    ...autoRefreshState,
  };
}

/**
 * Manage the dashboard transient state.
 * @returns The dashboard transient state and callbacks.
 */
function useDashboardTransientState() {
  const [feed, setFeed] = useState<Article[]>([]);
  const feedRef = useRef<Article[]>([]);
  feedRef.current = feed;
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const categoriesRef = useRef(INITIAL_CATEGORIES);
  categoriesRef.current = categories;
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const hasInitializedDashboardRef = useRef(false);

  return {
    categories,
    categoriesRef,
    feed,
    feedRef,
    hasInitializedDashboardRef,
    isCategoriesLoading,
    isSidebarVisible,
    loading,
    setCategories,
    setFeed,
    setIsCategoriesLoading,
    setIsSidebarVisible,
    setLoading,
  };
}
