"use client";

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
} from "react";

import type { CategoryTreeNode } from "@/lib/core";

import {
  refillDashboardArticleWindow,
  resetDashboardArticleWindowState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPaging";
import { resetArticleWindowPrefetchState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPrefetchState";
import {
  resolveArticleWindowAvailability,
  shouldRefillDepletedUnreadWindow,
} from "@/app/dashboard/dashboard-services/article";
import { type FeedSelectionFetchers } from "@/app/dashboard/dashboard-services/selection";

interface ArticleWindowRefCollection {
  allowPartialArticleWindowGrowthRef: RefObject<boolean>;
  hasStartedArticleWindowSettlementRef: RefObject<boolean>;
  inFlightPrefetchedLimitRef: RefObject<number>;
  isAwaitingArticleWindowSettlementRef: RefObject<boolean>;
  isLoadingMoreArticlesRef: RefObject<boolean>;
  isRefillingDepletedUnreadWindowRef: RefObject<boolean>;
  lastPrefetchedLimitRef: RefObject<number>;
  previousAwaitedFeedLengthRef: RefObject<number>;
}

interface UseArticleWindowAvailabilityOptions {
  allowPartialArticleWindowGrowthRef: RefObject<boolean>;
  currentFeedLength: number;
  hasMoreServerArticles: boolean;
  hasStartedArticleWindowSettlementRef: RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: RefObject<boolean>;
  isLoading: boolean;
  isLoadingMoreArticlesRef: RefObject<boolean>;
  previousAwaitedFeedLengthRef: RefObject<number>;
  requestedArticleLimit: number;
  setHasMoreServerArticles: Dispatch<SetStateAction<boolean>>;
  setIsLoadingMoreArticles: Dispatch<SetStateAction<boolean>>;
  shouldUseArticleWindow: boolean;
}

interface UseResetArticleWindowOptions extends ArticleWindowRefCollection {
  articleFilter: string;
  articlesPerPage: number;
  selectedCategory: string;
  setHasMoreServerArticles: Dispatch<SetStateAction<boolean>>;
  setIsLoadingMoreArticles: Dispatch<SetStateAction<boolean>>;
  setRequestedArticleLimit: Dispatch<SetStateAction<number>>;
  shouldUseArticleWindow: boolean;
}

interface UseUnreadWindowRefillOptions extends FeedSelectionFetchers {
  allowPartialArticleWindowGrowthRef: RefObject<boolean>;
  articleFilter: string;
  articlesPerPage: number;
  currentFeedLength: number;
  currentFilteredFeedLength: number;
  hasMoreServerArticles: boolean;
  hasStartedArticleWindowSettlementRef: RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: RefObject<boolean>;
  isLoading: boolean;
  isRefillingDepletedUnreadWindowRef: RefObject<boolean>;
  previousAwaitedFeedLengthRef: RefObject<number>;
  requestedArticleLimit: number;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  shouldUseArticleWindow: boolean;
}

/**
 * Manage the article window availability.
 * @param options - The options used to manage the article window availability.
 */
export function useArticleWindowAvailability(
  options: UseArticleWindowAvailabilityOptions,
): void {
  const {
    allowPartialArticleWindowGrowthRef,
    currentFeedLength,
    hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoading,
    isLoadingMoreArticlesRef,
    previousAwaitedFeedLengthRef,
    requestedArticleLimit,
    setHasMoreServerArticles,
    setIsLoadingMoreArticles,
    shouldUseArticleWindow,
  } = options;
  useEffect(() => {
    const nextAvailability = resolveArticleWindowAvailability({
      allowPartialFeedGrowth: allowPartialArticleWindowGrowthRef.current,
      currentFeedLength,
      hasStartedAwaitedWindowSettlement:
        hasStartedArticleWindowSettlementRef.current,
      isAwaitingWindowSettlement: isAwaitingArticleWindowSettlementRef.current,
      isLoading,
      previousFeedLength: previousAwaitedFeedLengthRef.current,
      previousHasMoreServerArticles: hasMoreServerArticles,
      requestedArticleLimit,
      shouldUseArticleWindow,
    });

    if (nextAvailability.shouldClearAwaitingWindowSettlement) {
      isAwaitingArticleWindowSettlementRef.current = false;
      allowPartialArticleWindowGrowthRef.current = false;
      hasStartedArticleWindowSettlementRef.current = false;
    }

    if (!shouldUseArticleWindow) {
      isLoadingMoreArticlesRef.current = false;
      setIsLoadingMoreArticles(false);
    }

    if (nextAvailability.hasMoreServerArticles !== hasMoreServerArticles) {
      setHasMoreServerArticles(nextAvailability.hasMoreServerArticles);
    }

    if (
      isLoadingMoreArticlesRef.current &&
      !isLoading &&
      !isAwaitingArticleWindowSettlementRef.current
    ) {
      isLoadingMoreArticlesRef.current = false;
      setIsLoadingMoreArticles(false);
    }
  }, [
    allowPartialArticleWindowGrowthRef,
    currentFeedLength,
    hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoading,
    isLoadingMoreArticlesRef,
    previousAwaitedFeedLengthRef,
    requestedArticleLimit,
    setHasMoreServerArticles,
    setIsLoadingMoreArticles,
    shouldUseArticleWindow,
  ]);
}

/**
 * Manage the reset article window on selection change.
 * @param options - The options used to manage the reset article window on selection change.
 */
export function useResetArticleWindowOnSelectionChange(
  options: UseResetArticleWindowOptions,
): void {
  const {
    allowPartialArticleWindowGrowthRef,
    articleFilter,
    articlesPerPage,
    hasStartedArticleWindowSettlementRef,
    inFlightPrefetchedLimitRef,
    isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef,
    lastPrefetchedLimitRef,
    previousAwaitedFeedLengthRef,
    selectedCategory,
    setHasMoreServerArticles,
    setIsLoadingMoreArticles,
    setRequestedArticleLimit,
    shouldUseArticleWindow,
  } = options;
  useEffect(() => {
    resetArticleWindowPrefetchState({
      inFlightPrefetchedLimitRef,
      lastPrefetchedLimitRef,
    });
    resetDashboardArticleWindowState(
      {
        allowPartialArticleWindowGrowthRef,
        hasStartedArticleWindowSettlementRef,
        isAwaitingArticleWindowSettlementRef,
        isLoadingMoreArticlesRef,
        isRefillingDepletedUnreadWindowRef,
        previousAwaitedFeedLengthRef,
        setHasMoreServerArticles,
        setIsLoadingMoreArticles,
        setRequestedArticleLimit,
      },
      {
        articlesPerPage,
        shouldUseArticleWindow,
      },
    );
  }, [
    allowPartialArticleWindowGrowthRef,
    articleFilter,
    articlesPerPage,
    hasStartedArticleWindowSettlementRef,
    inFlightPrefetchedLimitRef,
    isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef,
    lastPrefetchedLimitRef,
    previousAwaitedFeedLengthRef,
    selectedCategory,
    setHasMoreServerArticles,
    setIsLoadingMoreArticles,
    setRequestedArticleLimit,
    shouldUseArticleWindow,
  ]);
}

/**
 * Manage the unread window refill.
 * @param options - The options used to manage the unread window refill.
 */
export function useUnreadWindowRefill(
  options: UseUnreadWindowRefillOptions,
): void {
  const {
    allowPartialArticleWindowGrowthRef,
    articleFilter,
    articlesPerPage,
    currentFeedLength,
    currentFilteredFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoading,
    isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef,
    requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    shouldUseArticleWindow,
  } = options;
  useEffect(() => {
    if (
      !shouldRefillDepletedUnreadWindow({
        articleFilter,
        articlesPerPage,
        currentFeedLength,
        currentFilteredFeedLength,
        hasMoreServerArticles,
        isLoading,
        isRefillingDepletedUnreadWindow:
          isRefillingDepletedUnreadWindowRef.current,
        shouldUseArticleWindow,
      })
    ) {
      return;
    }

    refillDashboardArticleWindow({
      allowPartialArticleWindowGrowthRef,
      articleLimit: requestedArticleLimit,
      currentFeedLength,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      hasStartedArticleWindowSettlementRef,
      isAwaitingArticleWindowSettlementRef,
      isRefillingDepletedUnreadWindowRef,
      previousAwaitedFeedLengthRef,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
    });
  }, [
    allowPartialArticleWindowGrowthRef,
    articleFilter,
    articlesPerPage,
    currentFeedLength,
    currentFilteredFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoading,
    isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef,
    requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    shouldUseArticleWindow,
  ]);
}
