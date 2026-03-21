"use client";

import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type Article,
  type CategoryTreeNode,
  useLocalStorage,
  useSessionState,
} from "@/lib";
import { clientFeedCacheTtlMinutes } from "@/lib/config";

import { ALL_FEEDS_NODE_KEY, INITIAL_CATEGORIES } from "../constants";
import { type ArticleFilter } from "../services/article-filters";
import {
  AUTO_REFRESH_INTERVAL_STORAGE_KEY,
  normalizeAutoRefreshIntervalMinutes,
  resolveDefaultAutoRefreshIntervalMinutes,
} from "../services/refresh-policy";

/**
 * Owns the dashboard's local and persisted state buckets.
 *
 * This hook is the single source of truth for feed data, selection state,
 * settings modal visibility, and sidebar state. It deliberately mixes plain
 * React state with local/session-backed state so user preferences persist while
 * volatile UI state resets appropriately.
 *
 * @returns Mutable state, refs, and setters consumed by the dashboard controller.
 */
export function useDashboardState() {
  const defaultAutoRefreshIntervalMinutes =
    resolveDefaultAutoRefreshIntervalMinutes(clientFeedCacheTtlMinutes());
  /** Currently rendered article list for the active selection. */
  const [feed, setFeed] = useState<Article[]>([]);
  /** Async refresh work reads from this ref so it can merge against the latest feed snapshot safely. */
  const feedRef = useRef<Article[]>([]);
  feedRef.current = feed;
  /** Global loading flag for feed/category fetch work. */
  const [loading, setLoading] = useState(true);
  /** Sidebar category/feed tree currently available to the user. */
  const [categories, setCategories] =
    useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);

  const categoriesRef = useRef<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  categoriesRef.current = categories;

  /** Persisted node key for the currently selected feed or category. */
  const [selectedCategory, setSelectedCategory] = useLocalStorage<string>(
    "librerss:selectedCategory",
    ALL_FEEDS_NODE_KEY,
  );
  /** Session-scoped search text so refreshes in the same tab keep the active query. */
  const [searchTerm, setSearchTerm] = useSessionState<string>(
    "librerss:searchTerm",
    "",
  );
  /** Expanded article identity restored within the current browsing session. */
  const [expandedArticleKey, setExpandedArticleKey] = useSessionState<
    null | string
  >("librerss:expandedArticleKey", null);
  /** Session-scoped settings modal visibility. */
  const [showSettingsModal, setShowSettingsModal] = useSessionState<boolean>(
    "librerss:showSettingsModal",
    false,
  );
  /** Mount-driven sidebar reveal flag used for entry animations. */
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  /** Mobile sidebar drawer state persisted for the current tab session. */
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] =
    useSessionState<boolean>("librerss:isMobileSidebarOpen", false);

  /** Persisted article visibility filter such as unread or starred. */
  const [articleFilter, setArticleFilter] = useLocalStorage<ArticleFilter>(
    "librerss:articleFilter",
    "unread",
  );
  /** Persisted preference for rendering feed favicons in the UI. */
  const [showFavicons, setShowFavicons] = useLocalStorage<boolean>(
    "librerss:showFavicons",
    true,
  );
  /** Persisted automatic refresh interval with a hard floor. */
  const [
    storedAutoRefreshIntervalMinutes,
    setStoredAutoRefreshIntervalMinutes,
  ] = useLocalStorage<number>(
    AUTO_REFRESH_INTERVAL_STORAGE_KEY,
    defaultAutoRefreshIntervalMinutes,
  );

  /** Persisted articles-per-page for client-side infinite scroll pagination. */
  const [articlesPerPage, setArticlesPerPage] = useLocalStorage<number>(
    "librerss:articlesPerPage",
    12,
  );
  const autoRefreshIntervalMinutes = normalizeAutoRefreshIntervalMinutes(
    storedAutoRefreshIntervalMinutes,
    defaultAutoRefreshIntervalMinutes,
  );

  useEffect(() => {
    if (storedAutoRefreshIntervalMinutes !== autoRefreshIntervalMinutes) {
      setStoredAutoRefreshIntervalMinutes(autoRefreshIntervalMinutes);
    }
  }, [
    autoRefreshIntervalMinutes,
    setStoredAutoRefreshIntervalMinutes,
    storedAutoRefreshIntervalMinutes,
  ]);

  const setAutoRefreshIntervalMinutes = useCallback(
    (value: SetStateAction<number>) => {
      setStoredAutoRefreshIntervalMinutes((currentValue) => {
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
    [defaultAutoRefreshIntervalMinutes, setStoredAutoRefreshIntervalMinutes],
  );

  /** Loading state for the category/feed source tree specifically. */
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  /** One-time initialization guard for bootstrapping the dashboard selection flow. */
  const hasInitializedDashboardRef = useRef(false);

  return {
    articleFilter,
    articlesPerPage,
    autoRefreshIntervalMinutes,
    categories,
    categoriesRef,
    expandedArticleKey,
    feed,
    feedRef,
    hasInitializedDashboardRef,
    isCategoriesLoading,
    isMobileSidebarOpen,
    isSidebarVisible,
    loading,
    searchTerm,
    selectedCategory,
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
    showFavicons,
    showSettingsModal,
  };
}
