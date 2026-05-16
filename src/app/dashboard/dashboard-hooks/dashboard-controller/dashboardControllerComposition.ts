"use client";

import { useCallback } from "react";

import type { Article } from "@/lib/core";

import {
  useDashboardEffects,
  useDashboardEvents,
  useDashboardHandlers,
} from "@/app/dashboard/dashboard-hooks";
import { collectFullyVisibleUnreadArticles } from "@/app/dashboard/dashboard-services";

/**
 * Describes the options for dashboard controller runtime state.
 */
export interface DashboardControllerRuntimeStateOptions {
  articleLimit: DashboardHandlersOptions["articleLimit"];
  fetchAllFeeds: DashboardHandlersOptions["fetchAllFeeds"];
  fetchCategoryFeeds: DashboardHandlersOptions["fetchCategoryFeeds"];
  fetchFeed: DashboardHandlersOptions["fetchFeed"];
  hasHydratedPersistedPreferences: boolean;
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
  selectionArticleLimit: DashboardHandlersOptions["selectionArticleLimit"];
  setIsCategoriesLoading: DashboardEffectsOptions["setIsCategoriesLoading"];
  setIsMobileSidebarOpen: DashboardHandlersOptions["setIsMobileSidebarOpen"];
  setIsSidebarVisible: DashboardEffectsOptions["setIsSidebarVisible"];
  setLoading: DashboardEffectsOptions["setLoading"];
  setSelectedCategory: DashboardHandlersOptions["setSelectedCategory"];
  timeoutMs: DashboardEffectsOptions["timeoutMs"];
}
/**
 * Describes the options for dashboard effects.
 */
export type DashboardEffectsOptions = Parameters<typeof useDashboardEffects>[0];
/**
 * Describes the options for dashboard events.
 */
export type DashboardEventsOptions = Parameters<typeof useDashboardEvents>[0];

/**
 * Describes the options for dashboard handlers.
 */
export type DashboardHandlersOptions = Parameters<
  typeof useDashboardHandlers
>[0];
/**
 * Describes the options for dashboard controller event bindings.
 */
interface DashboardControllerEventBindingsOptions {
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
}

/**
 * Describes the options for dashboard handler options.
 */
interface DashboardHandlerOptionsOptions {
  articleLimit: DashboardHandlersOptions["articleLimit"];
  fetchAllFeeds: DashboardHandlersOptions["fetchAllFeeds"];
  fetchCategoryFeeds: DashboardHandlersOptions["fetchCategoryFeeds"];
  fetchFeed: DashboardHandlersOptions["fetchFeed"];
  prefetchAllFeeds: DashboardHandlersOptions["prefetchAllFeeds"];
  prefetchCategoryFeeds: DashboardHandlersOptions["prefetchCategoryFeeds"];
  prefetchFeed: DashboardHandlersOptions["prefetchFeed"];
  searchTerm: DashboardHandlersOptions["searchTerm"];
  selectedCategory: DashboardHandlersOptions["selectedCategory"];
  selectedCategoryNode: DashboardHandlersOptions["selectedCategoryNode"];
  selectedFeedUrl: DashboardHandlersOptions["selectedFeedUrl"];
  selectionArticleLimit: DashboardHandlersOptions["selectionArticleLimit"];
  setIsMobileSidebarOpen: DashboardHandlersOptions["setIsMobileSidebarOpen"];
  setSelectedCategory: DashboardHandlersOptions["setSelectedCategory"];
}

/**
 * Describes the options for dashboard shared fetch options.
 */
interface DashboardSharedFetchOptionsOptions {
  fetchAllFeeds: DashboardHandlersOptions["fetchAllFeeds"];
  fetchCategoryFeeds: DashboardHandlersOptions["fetchCategoryFeeds"];
  fetchFeed: DashboardHandlersOptions["fetchFeed"];
  searchTerm: DashboardHandlersOptions["searchTerm"];
  selectedCategory: DashboardHandlersOptions["selectedCategory"];
  selectedCategoryNode: DashboardHandlersOptions["selectedCategoryNode"];
  selectedFeedUrl: DashboardHandlersOptions["selectedFeedUrl"];
  setSelectedCategory: DashboardHandlersOptions["setSelectedCategory"];
}

/**
 * Manage the dashboard controller event bindings.
 * @param options - The options used to manage the dashboard controller event bindings.
 */
export function useDashboardControllerEventBindings(
  options: DashboardControllerEventBindingsOptions,
) {
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
/**
 * Manage the dashboard controller runtime state.
 * @param options - The options used to manage the dashboard controller runtime state.
 * @returns The dashboard controller runtime state and callbacks.
 */
export function useDashboardControllerRuntimeState(
  options: DashboardControllerRuntimeStateOptions,
) {
  const handlers = useDashboardHandlers(createDashboardHandlerOptions(options));

  useDashboardEffects(createDashboardEffectOptions(options));

  return handlers;
}

/**
 * Create the dashboard effect options.
 * @param options - The options used to create the dashboard effect options.
 * @returns The dashboard effect options.
 */
function createDashboardEffectOptions(
  options: DashboardControllerRuntimeStateOptions,
) {
  return {
    ...createDashboardSharedFetchOptions(options),
    hasHydratedPersistedPreferences: options.hasHydratedPersistedPreferences,
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
/**
 * Create the dashboard handler options.
 * @param options - The options used to create the dashboard handler options.
 * @returns The dashboard handler options.
 */
function createDashboardHandlerOptions(
  options: DashboardHandlerOptionsOptions,
) {
  return {
    ...createDashboardSharedFetchOptions(options),
    articleLimit: options.articleLimit,
    prefetchAllFeeds: options.prefetchAllFeeds,
    prefetchCategoryFeeds: options.prefetchCategoryFeeds,
    prefetchFeed: options.prefetchFeed,
    searchTerm: options.searchTerm,
    selectionArticleLimit: options.selectionArticleLimit,
    setIsMobileSidebarOpen: options.setIsMobileSidebarOpen,
  } satisfies DashboardHandlersOptions;
}

/**
 * Create the dashboard shared fetch options.
 * @param options - The options used to create the dashboard shared fetch options.
 * @returns The dashboard shared fetch options.
 */
function createDashboardSharedFetchOptions(
  options: DashboardSharedFetchOptionsOptions,
) {
  return {
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    searchTerm: options.searchTerm,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    setSelectedCategory: options.setSelectedCategory,
  };
}
