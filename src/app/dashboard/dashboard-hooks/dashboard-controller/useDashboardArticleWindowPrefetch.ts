"use client";

import { useCallback, useEffect } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import { prefetchNextPageForCurrentSelection } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPaging";
import { prefetchArticleWindowLimitIfNeeded } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPrefetchState";
import { type FeedSelectionFetchers } from "@/app/dashboard/dashboard-services/selection";

interface UseDashboardArticleWindowLoadingStateOptions {
  hasStartedArticleWindowSettlementRef: React.RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: React.RefObject<boolean>;
  isLoading: boolean;
  shouldUseArticleWindow: boolean;
}

interface UseDashboardArticleWindowPrefetchOptions {
  articlesPerPage: number;
  hasMoreServerArticles: boolean;
  inFlightPrefetchedLimitRef: React.RefObject<number>;
  isLoading: boolean;
  lastPrefetchedLimitRef: React.RefObject<number>;
  prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  prefetchFeed: FeedSelectionFetchers["fetchFeed"];
  requestedArticleLimit: number;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  shouldUseArticleWindow: boolean;
  usePlaceholderData: boolean;
}

/** Marks article-window settlement as active whenever the live feed starts loading. */
export function useDashboardArticleWindowLoadingState(
  options: UseDashboardArticleWindowLoadingStateOptions,
) {
  const {
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoading,
    shouldUseArticleWindow,
  } = options;

  useEffect(() => {
    if (shouldUseArticleWindow && isLoading) {
      isAwaitingArticleWindowSettlementRef.current = true;
      hasStartedArticleWindowSettlementRef.current = true;
    }
  }, [
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoading,
    shouldUseArticleWindow,
  ]);
}

/**
 * Keeps the next article-window page warm in the query cache so repeated
 * load-more interactions can hydrate from a completed prefetch when available.
 */
export function useDashboardArticleWindowPrefetch(
  options: UseDashboardArticleWindowPrefetchOptions,
) {
  const {
    articlesPerPage,
    hasMoreServerArticles,
    inFlightPrefetchedLimitRef,
    isLoading,
    lastPrefetchedLimitRef,
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    prefetchFeed,
    requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    shouldUseArticleWindow,
    usePlaceholderData,
  } = options;

  const prefetchNextPage = useCallback(
    async (nextLimit: number) => {
      await prefetchNextPageForCurrentSelection(nextLimit, {
        prefetchAllFeeds,
        prefetchCategoryFeeds,
        prefetchFeed,
        selectedCategory,
        selectedCategoryNode,
        selectedFeedUrl,
        usePlaceholderData,
      });
    },
    [
      prefetchAllFeeds,
      prefetchCategoryFeeds,
      prefetchFeed,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
      usePlaceholderData,
    ],
  );
  const requestNextPagePrefetch = useCallback(
    async (nextLimit: number) => {
      await prefetchArticleWindowLimitIfNeeded(
        nextLimit,
        {
          inFlightPrefetchedLimitRef,
          lastPrefetchedLimitRef,
        },
        prefetchNextPage,
      );
    },
    [inFlightPrefetchedLimitRef, lastPrefetchedLimitRef, prefetchNextPage],
  );

  useArticleWindowPrefetchEffect({
    articlesPerPage,
    hasMoreServerArticles,
    inFlightPrefetchedLimitRef,
    isLoading,
    lastPrefetchedLimitRef,
    prefetchNextPage: requestNextPagePrefetch,
    requestedArticleLimit,
    shouldUseArticleWindow,
  });

  return requestNextPagePrefetch;
}

function useArticleWindowPrefetchEffect({
  articlesPerPage,
  hasMoreServerArticles,
  inFlightPrefetchedLimitRef,
  isLoading,
  lastPrefetchedLimitRef,
  prefetchNextPage,
  requestedArticleLimit,
  shouldUseArticleWindow,
}: {
  articlesPerPage: number;
  hasMoreServerArticles: boolean;
  inFlightPrefetchedLimitRef: React.RefObject<number>;
  isLoading: boolean;
  lastPrefetchedLimitRef: React.RefObject<number>;
  prefetchNextPage: (nextLimit: number) => Promise<void>;
  requestedArticleLimit: number;
  shouldUseArticleWindow: boolean;
}) {
  useEffect(() => {
    if (!shouldUseArticleWindow || isLoading || !hasMoreServerArticles) {
      return;
    }

    const nextLimit = requestedArticleLimit + articlesPerPage;
    if (
      lastPrefetchedLimitRef.current >= nextLimit ||
      inFlightPrefetchedLimitRef.current >= nextLimit
    ) {
      return;
    }

    void prefetchNextPage(nextLimit);
  }, [
    articlesPerPage,
    hasMoreServerArticles,
    inFlightPrefetchedLimitRef,
    isLoading,
    lastPrefetchedLimitRef,
    prefetchNextPage,
    requestedArticleLimit,
    shouldUseArticleWindow,
  ]);
}
