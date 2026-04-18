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
 * @param root0
 * @param root0.allowPartialArticleWindowGrowthRef
 * @param root0.currentFeedLength
 * @param root0.hasMoreServerArticles
 * @param root0.hasStartedArticleWindowSettlementRef
 * @param root0.isAwaitingArticleWindowSettlementRef
 * @param root0.isLoading
 * @param root0.isLoadingMoreArticlesRef
 * @param root0.previousAwaitedFeedLengthRef
 * @param root0.requestedArticleLimit
 * @param root0.setHasMoreServerArticles
 * @param root0.setIsLoadingMoreArticles
 * @param root0.shouldUseArticleWindow
 */
export function useArticleWindowAvailability({
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
}: UseArticleWindowAvailabilityOptions): void {
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
 * @param root0
 * @param root0.allowPartialArticleWindowGrowthRef
 * @param root0.articleFilter
 * @param root0.articlesPerPage
 * @param root0.hasStartedArticleWindowSettlementRef
 * @param root0.inFlightPrefetchedLimitRef
 * @param root0.isAwaitingArticleWindowSettlementRef
 * @param root0.isLoadingMoreArticlesRef
 * @param root0.isRefillingDepletedUnreadWindowRef
 * @param root0.lastPrefetchedLimitRef
 * @param root0.previousAwaitedFeedLengthRef
 * @param root0.selectedCategory
 * @param root0.setHasMoreServerArticles
 * @param root0.setIsLoadingMoreArticles
 * @param root0.setRequestedArticleLimit
 * @param root0.shouldUseArticleWindow
 */
export function useResetArticleWindowOnSelectionChange({
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
}: UseResetArticleWindowOptions): void {
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
 * @param root0
 * @param root0.allowPartialArticleWindowGrowthRef
 * @param root0.articleFilter
 * @param root0.articlesPerPage
 * @param root0.currentFeedLength
 * @param root0.currentFilteredFeedLength
 * @param root0.fetchAllFeeds
 * @param root0.fetchCategoryFeeds
 * @param root0.fetchFeed
 * @param root0.hasMoreServerArticles
 * @param root0.hasStartedArticleWindowSettlementRef
 * @param root0.isAwaitingArticleWindowSettlementRef
 * @param root0.isLoading
 * @param root0.isRefillingDepletedUnreadWindowRef
 * @param root0.previousAwaitedFeedLengthRef
 * @param root0.requestedArticleLimit
 * @param root0.selectedCategory
 * @param root0.selectedCategoryNode
 * @param root0.selectedFeedUrl
 * @param root0.shouldUseArticleWindow
 */
export function useUnreadWindowRefill({
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
}: UseUnreadWindowRefillOptions): void {
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
