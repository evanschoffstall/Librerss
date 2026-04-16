"use client";

import { useCallback } from "react";

import type { Article } from "@/lib/core";

import {
  useDashboardEffects,
  useDashboardEvents,
  useDashboardHandlers,
} from "@/app/dashboard/dashboard-hooks";
import { collectFullyVisibleUnreadArticles } from "@/app/dashboard/dashboard-services";

export interface DashboardControllerRuntimeStateOptions {
  articleLimit: DashboardHandlersOptions["articleLimit"];
  fetchAllFeeds: DashboardHandlersOptions["fetchAllFeeds"];
  fetchCategoryFeeds: DashboardHandlersOptions["fetchCategoryFeeds"];
  fetchFeed: DashboardHandlersOptions["fetchFeed"];
  hasInitializedDashboardRef: DashboardEffectsOptions["hasInitializedDashboardRef"];
  initialArticleLimit: DashboardEffectsOptions["initialArticleLimit"];
  isSearchPending: DashboardEffectsOptions["isSearchPending"];
  isShellLoading: DashboardEffectsOptions["isShellLoading"];
  loadFeedSources: DashboardEffectsOptions["loadFeedSources"];
  loading: DashboardEffectsOptions["loading"];
  loadingEpoch: DashboardEffectsOptions["loadingEpoch"];
  onTimeout: DashboardEffectsOptions["onTimeout"];
  prefetchAllFeeds: DashboardHandlersOptions["prefetchAllFeeds"];
  prefetchCategoryFeeds: DashboardHandlersOptions["prefetchCategoryFeeds"];
  prefetchFeed: DashboardHandlersOptions["prefetchFeed"];
  searchTerm: DashboardEffectsOptions["searchTerm"];
  selectedCategory: DashboardHandlersOptions["selectedCategory"];
  selectedCategoryNode: DashboardHandlersOptions["selectedCategoryNode"];
  selectedFeed: DashboardEffectsOptions["selectedFeed"];
  selectedFeedUrl: DashboardHandlersOptions["selectedFeedUrl"];
  setIsCategoriesLoading: DashboardEffectsOptions["setIsCategoriesLoading"];
  setIsMobileSidebarOpen: DashboardHandlersOptions["setIsMobileSidebarOpen"];
  setIsSidebarVisible: DashboardEffectsOptions["setIsSidebarVisible"];
  setLoading: DashboardEffectsOptions["setLoading"];
  setSelectedCategory: DashboardHandlersOptions["setSelectedCategory"];
  timeoutMs: DashboardEffectsOptions["timeoutMs"];
}
export type DashboardEffectsOptions = Parameters<typeof useDashboardEffects>[0];
export type DashboardEventsOptions = Parameters<typeof useDashboardEvents>[0];

export type DashboardHandlersOptions = Parameters<
  typeof useDashboardHandlers
>[0];

export function useDashboardControllerEventBindings(options: {
  feed: Article[];
  handleMarkArticlesRead: (articles: Article[]) => Promise<void>;
  handleRefreshSelection: DashboardEventsOptions["onRefresh"];
  selectedCategory: DashboardEventsOptions["selectedCategory"];
  selectedCategoryNode: DashboardEventsOptions["selectedCategoryNode"];
  selectedFeedUrl: DashboardEventsOptions["selectedFeedUrl"];
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setIsMobileSidebarOpen: (open: boolean) => void;
  setSearchTerm: DashboardEventsOptions["onSearchChange"];
  setShowSettingsModal: () => void;
  usePlaceholderData: boolean;
}) {
  const handleMarkAllReadLocally = useCallback(() => {
    options.setFeed((currentFeed) =>
      currentFeed.map((article) => ({ ...article, isRead: true })),
    );
  }, [options]);

  const handleMarkViewportRead = useCallback(async () => {
    await options.handleMarkArticlesRead(
      collectFullyVisibleUnreadArticles(options.feed),
    );
  }, [options]);

  const handleOpenFeedsSidebar = useCallback(() => {
    options.setIsMobileSidebarOpen(true);
  }, [options]);

  const handleOpenSettings = useCallback(() => {
    options.setShowSettingsModal();
  }, [options]);

  useDashboardEvents({
    onMarkAllReadLocally: handleMarkAllReadLocally,
    onMarkViewportRead: handleMarkViewportRead,
    onOpenFeedsSidebar: handleOpenFeedsSidebar,
    onOpenSettings: handleOpenSettings,
    onRefresh: options.handleRefreshSelection,
    onSearchChange: options.setSearchTerm,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    usePlaceholderData: options.usePlaceholderData,
  });
}

export function useDashboardControllerRuntimeState(
  options: DashboardControllerRuntimeStateOptions,
) {
  const handlers = useDashboardHandlers(createDashboardHandlerOptions(options));

  useDashboardEffects(createDashboardEffectOptions(options));

  return handlers;
}

function createDashboardEffectOptions(
  options: DashboardControllerRuntimeStateOptions,
) {
  return {
    ...createDashboardSharedFetchOptions(options),
    hasInitializedDashboardRef: options.hasInitializedDashboardRef,
    initialArticleLimit: options.initialArticleLimit,
    isSearchPending: options.isSearchPending,
    isShellLoading: options.isShellLoading,
    loadFeedSources: options.loadFeedSources,
    loading: options.loading,
    loadingEpoch: options.loadingEpoch,
    onTimeout: options.onTimeout,
    searchTerm: options.searchTerm,
    selectedFeed: options.selectedFeed,
    setIsCategoriesLoading: options.setIsCategoriesLoading,
    setIsSidebarVisible: options.setIsSidebarVisible,
    setLoading: options.setLoading,
    timeoutMs: options.timeoutMs,
  } satisfies DashboardEffectsOptions;
}

function createDashboardHandlerOptions(options: {
  articleLimit: DashboardHandlersOptions["articleLimit"];
  fetchAllFeeds: DashboardHandlersOptions["fetchAllFeeds"];
  fetchCategoryFeeds: DashboardHandlersOptions["fetchCategoryFeeds"];
  fetchFeed: DashboardHandlersOptions["fetchFeed"];
  prefetchAllFeeds: DashboardHandlersOptions["prefetchAllFeeds"];
  prefetchCategoryFeeds: DashboardHandlersOptions["prefetchCategoryFeeds"];
  prefetchFeed: DashboardHandlersOptions["prefetchFeed"];
  selectedCategory: DashboardHandlersOptions["selectedCategory"];
  selectedCategoryNode: DashboardHandlersOptions["selectedCategoryNode"];
  selectedFeedUrl: DashboardHandlersOptions["selectedFeedUrl"];
  setIsMobileSidebarOpen: DashboardHandlersOptions["setIsMobileSidebarOpen"];
  setSelectedCategory: DashboardHandlersOptions["setSelectedCategory"];
}) {
  return {
    ...createDashboardSharedFetchOptions(options),
    articleLimit: options.articleLimit,
    prefetchAllFeeds: options.prefetchAllFeeds,
    prefetchCategoryFeeds: options.prefetchCategoryFeeds,
    prefetchFeed: options.prefetchFeed,
    setIsMobileSidebarOpen: options.setIsMobileSidebarOpen,
  } satisfies DashboardHandlersOptions;
}

function createDashboardSharedFetchOptions(options: {
  fetchAllFeeds: DashboardHandlersOptions["fetchAllFeeds"];
  fetchCategoryFeeds: DashboardHandlersOptions["fetchCategoryFeeds"];
  fetchFeed: DashboardHandlersOptions["fetchFeed"];
  selectedCategory: DashboardHandlersOptions["selectedCategory"];
  selectedCategoryNode: DashboardHandlersOptions["selectedCategoryNode"];
  selectedFeedUrl: DashboardHandlersOptions["selectedFeedUrl"];
  setSelectedCategory: DashboardHandlersOptions["setSelectedCategory"];
}) {
  return {
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    setSelectedCategory: options.setSelectedCategory,
  };
}
