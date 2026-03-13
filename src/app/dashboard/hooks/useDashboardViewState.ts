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

export function useDashboardViewState() {
  const [feed, setFeed] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] =
    useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const categoriesRef = useRef<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  categoriesRef.current = categories;

  const [selectedCategory, setSelectedCategory] = useLocalStorage<string>(
    "librerss:selectedCategory",
    ALL_FEEDS_NODE_KEY,
  );
  const [searchTerm, setSearchTerm] = useSessionState<string>(
    "librerss:searchTerm",
    "",
  );
  const [expandedArticleKey, setExpandedArticleKey] = useSessionState<
    null | string
  >("librerss:expandedArticleKey", null);
  const [showSettingsModal, setShowSettingsModal] = useSessionState<boolean>(
    "librerss:showSettingsModal",
    false,
  );
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] =
    useSessionState<boolean>("librerss:isMobileSidebarOpen", false);

  const [articleFilter, setArticleFilter] = useLocalStorage<ArticleFilter>(
    "librerss:articleFilter",
    "unread",
  );
  const [pageSize, setPageSize] = useLocalStorage<number>(
    "librerss:pageSize",
    25,
  );
  const [showFavicons, setShowFavicons] = useLocalStorage<boolean>(
    "librerss:showFavicons",
    true,
  );

  const [visibleCount, setVisibleCount] = useSessionState<number>(
    "librerss:visibleCount",
    pageSize,
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const hasInitializedDashboardRef = useRef(false);

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
