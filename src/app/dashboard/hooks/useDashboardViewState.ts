"use client";

import {
  useLocalStorage,
  useSessionState,
  type Article,
  type CategoryTreeNode,
} from "@/lib";
import { useRef, useState } from "react";
import { ALL_FEEDS_NODE_KEY, INITIAL_CATEGORIES } from "../constants";
import { type ArticleFilter } from "../services/article-filters";

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
    string | null
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
    feed,
    setFeed,
    loading,
    setLoading,
    categories,
    setCategories,
    categoriesRef,
    selectedCategory,
    setSelectedCategory,
    searchTerm,
    setSearchTerm,
    expandedArticleKey,
    setExpandedArticleKey,
    showSettingsModal,
    setShowSettingsModal,
    isSidebarVisible,
    setIsSidebarVisible,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    articleFilter,
    setArticleFilter,
    pageSize,
    setPageSize,
    showFavicons,
    setShowFavicons,
    visibleCount,
    setVisibleCount,
    sentinelRef,
    isCategoriesLoading,
    setIsCategoriesLoading,
    hasInitializedDashboardRef,
  };
}
