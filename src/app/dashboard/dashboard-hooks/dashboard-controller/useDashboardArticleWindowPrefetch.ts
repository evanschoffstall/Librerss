"use client";

import { useCallback, useEffect } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import { prefetchNextPageForCurrentSelection } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPaging";
import { prefetchArticleWindowLimitIfNeeded } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPrefetchState";
import { type FeedSelectionFetchers } from "@/app/dashboard/dashboard-services/selection";

/**
 * Describes the options for article window prefetch effect.
 *
 * The `isLoadingMoreArticlesRef` ref is read synchronously at effect-call time
 * to block premature prefetches while a concurrent server refill or scroll
 * load-more fetch is already in-flight.  Because `refillDashboardArticleWindow`
 * sets this ref synchronously before the effect callback returns, the guard is
 * always current even when multiple `useEffect` callbacks fire within the same
 * React commit.
 */
interface ArticleWindowPrefetchEffectOptions {
  articlesPerPage: number;
  hasMoreServerArticles: boolean;
  inFlightPrefetchedLimitRef: React.RefObject<number>;
  isLoading: boolean;
  /**
   * Ref mirror of the `isLoadingMoreArticles` loading flag.
   *
   * Read synchronously inside the effect to skip scheduling a prefetch when an
   * unread-window refill or scroll load-more request has already claimed the
   * in-flight slot.  Prevents the three-concurrent-batch-request regression
   * where `useUnreadWindowRefill` and `useArticleWindowPrefetchEffect` both
   * fire in the same render cycle and dispatch separate requests for slightly
   * different article-window limits.
   */
  isLoadingMoreArticlesRef: React.RefObject<boolean>;
  lastPrefetchedLimitRef: React.RefObject<number>;
  prefetchNextPage: (nextLimit: number) => Promise<void>;
  requestedArticleLimit: number;
  shouldUseArticleWindow: boolean;
}

/**
 * Describes the options for use dashboard article window loading state.
 */
interface UseDashboardArticleWindowLoadingStateOptions {
  hasStartedArticleWindowSettlementRef: React.RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: React.RefObject<boolean>;
  isLoading: boolean;
  shouldUseArticleWindow: boolean;
}

/**
 * Describes the options for use dashboard article window prefetch.
 */
interface UseDashboardArticleWindowPrefetchOptions {
  articlesPerPage: number;
  hasMoreServerArticles: boolean;
  inFlightPrefetchedLimitRef: React.RefObject<number>;
  isLoading: boolean;
  /**
   * Ref mirror of the `isLoadingMoreArticles` loading flag forwarded from
   * `useDashboardArticleWindowState`.  Passed through to
   * `useArticleWindowPrefetchEffect` so the effect can abort early when a
   * concurrent server refill or scroll load-more fetch is already in-flight.
   */
  isLoadingMoreArticlesRef: React.RefObject<boolean>;
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

/**
 * Manage the dashboard article window loading state.
 * @param options - The options used to manage the dashboard article window loading state.
 */
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
 * Manage the dashboard article window prefetch.
 * @param options - The options used to manage the dashboard article window prefetch.
 * @returns The dashboard article window prefetch state and callbacks.
 */
export function useDashboardArticleWindowPrefetch(
  options: UseDashboardArticleWindowPrefetchOptions,
) {
  const {
    articlesPerPage,
    hasMoreServerArticles,
    inFlightPrefetchedLimitRef,
    isLoading,
    isLoadingMoreArticlesRef,
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
    isLoadingMoreArticlesRef,
    lastPrefetchedLimitRef,
    prefetchNextPage: requestNextPagePrefetch,
    requestedArticleLimit,
    shouldUseArticleWindow,
  });

  return requestNextPagePrefetch;
}

/**
 * Manage the article window prefetch effect.
 * @param options - The options used to manage the article window prefetch effect.
 */
/**
 * Fire a background prefetch for the article-window page that follows the
 * currently loaded window.
 *
 * The prefetch is skipped when any of the following hold:
 * - the article window feature is disabled (`!shouldUseArticleWindow`)
 * - the primary feed fetch is in-flight (`isLoading`)
 * - the server has no more articles (`!hasMoreServerArticles`)
 * - a refill or scroll load-more fetch is already in-flight
 *   (`isLoadingMoreArticlesRef.current`) — this prevents the three-concurrent-
 *   batch-request regression where `useUnreadWindowRefill` and this effect both
 *   fire in the same React commit and dispatch separate requests for different
 *   article-window limits before either one has settled
 * - the in-flight or last-completed prefetch already covers the target limit.
 *
 * After a refill completes and `isLoadingMoreArticlesRef` clears, the effect
 * re-runs automatically (the state mirror `isLoadingMoreArticles` is in the
 * dependency array of `useDashboardArticleWindowPrefetch`'s parent) and
 * schedules the correct next-page prefetch for the updated window size.
 *
 * @param options - Current article-window and prefetch-state inputs.
 */
function useArticleWindowPrefetchEffect(
  options: ArticleWindowPrefetchEffectOptions,
) {
  const {
    articlesPerPage,
    hasMoreServerArticles,
    inFlightPrefetchedLimitRef,
    isLoading,
    isLoadingMoreArticlesRef,
    lastPrefetchedLimitRef,
    prefetchNextPage,
    requestedArticleLimit,
    shouldUseArticleWindow,
  } = options;
  useEffect(() => {
    if (
      !shouldUseArticleWindow ||
      isLoading ||
      !hasMoreServerArticles ||
      isLoadingMoreArticlesRef.current
    ) {
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
    isLoadingMoreArticlesRef,
    lastPrefetchedLimitRef,
    prefetchNextPage,
    requestedArticleLimit,
    shouldUseArticleWindow,
  ]);
}
