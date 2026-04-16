"use client";

import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Article } from "@/lib/core";

import {
  DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
  DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
  DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
  normalizeAutoRefreshIntervalMinutes,
  resolveDefaultAutoRefreshIntervalMinutes,
} from "@/app/dashboard/dashboard-services";
import { type ArticleFilter } from "@/app/dashboard/dashboard-services/article";
import {
  ALL_FEEDS_NODE_KEY,
  INITIAL_CATEGORIES,
} from "@/app/dashboard/dashboard-services/dashboard-constants";
import { clientFeedCacheTtlMinutes } from "@/lib/config";
import { useLocalStorage } from "@/lib/hooks";

export function useDashboardState() {
  const persistentState = useDashboardPersistentState();
  const transientState = useDashboardTransientState();

  return {
    ...persistentState,
    ...transientState,
  };
}

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
  const [showFavicons, setShowFavicons] = useState(true);
  const [articlesPerPage, setArticlesPerPage] = useLocalStorage(
    DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
    12,
  );

  return {
    articleFilter,
    articlesPerPage,
    expandedArticleKey,
    isMobileSidebarOpen,
    searchTerm,
    selectedCategory,
    setArticleFilter,
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
