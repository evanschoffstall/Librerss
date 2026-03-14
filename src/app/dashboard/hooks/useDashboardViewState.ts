"use client";

import { useRef, useState } from "react";

import { ALL_FEEDS_NODE_KEY, INITIAL_CATEGORIES } from "../constants";
import { type ArticleFilter } from "../services/article-filters";

import {
  type Article,
  type CategoryTreeNode,
  useLocalStorage,
  useSessionState,
} from "@/lib";

/**
 * Owns the dashboard's local and persisted state buckets.
 *
 * This hook is the single source of truth for feed data, selection state,
 * settings modal visibility, sidebar state, and incremental rendering controls.
 * It deliberately mixes plain React state with local/session-backed state so
 * user preferences persist while volatile UI state resets appropriately.
 *
 * @returns Mutable state, refs, and setters consumed by the dashboard controller.
 */
export function useDashboardViewState() {
  /** Currently rendered article list for the active selection. */
  const [feed, setFeed] = useState<Article[]>([]);
  /** Global loading flag for feed/category fetch work. */
  const [loading, setLoading] = useState(true);
  /** Sidebar category/feed tree currently available to the user. */
  const [categories, setCategories] =
    useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);

  // Consumers need live access to the latest categories from async callbacks
  // without forcing those callbacks to rebind on every category mutation.
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
  /** Persisted page size controlling incremental feed list growth. */
  const [pageSize, setPageSize] = useLocalStorage<number>(
    "librerss:pageSize",
    25,
  );
  /** Persisted preference for rendering feed favicons in the UI. */
  const [showFavicons, setShowFavicons] = useLocalStorage<boolean>(
    "librerss:showFavicons",
    true,
  );

  /** Session-scoped count of currently visible feed items for incremental rendering. */
  const [visibleCount, setVisibleCount] = useSessionState<number>(
    "librerss:visibleCount",
    pageSize,
  );
  /** Sentinel element observed to reveal additional feed items as the user scrolls. */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  /** Loading state for the category/feed source tree specifically. */
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  /** One-time initialization guard for bootstrapping the dashboard selection flow. */
  const hasInitializedDashboardRef = useRef(false);

  /**
   * Returns the full state contract consumed by the dashboard controller.
   *
   * The object intentionally exposes both the refs and setters so higher-level
   * hooks can coordinate async workflows without prop-drilling individual pieces
   * through multiple intermediate layers.
   */
  return {
    articleFilter,
    categories,
    categoriesRef,
    expandedArticleKey,
    feed,
    hasInitializedDashboardRef,
    isCategoriesLoading,
    isMobileSidebarOpen,
    isSidebarVisible,
    loading,
    pageSize,
    searchTerm,
    selectedCategory,
    sentinelRef,
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
    showFavicons,
    showSettingsModal,
    visibleCount,
  };
}
