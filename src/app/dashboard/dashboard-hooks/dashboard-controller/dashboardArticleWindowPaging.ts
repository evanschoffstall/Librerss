"use client";

import type { CategoryTreeNode } from "@/lib/core";

import { resolveUnreadRefillThreshold } from "@/app/dashboard/dashboard-services/article";
import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import {
  type FeedFetchOptions,
  type FeedSelectionFetchers,
  refreshCurrentSelection,
} from "@/app/dashboard/dashboard-services/selection";

/**
 * Describes the options for dashboard article window counts.
 */
interface DashboardArticleWindowCountsOptions {
  currentFeedLength: number;
  isLoadingMoreArticles: boolean;
  requestedArticleLimit: number;
  shouldUseArticleWindow: boolean;
}

/**
 * Describes the options for dashboard article window helper.
 */
interface DashboardArticleWindowHelperOptions {
  prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  prefetchFeed: FeedSelectionFetchers["fetchFeed"];
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  usePlaceholderData: boolean;
}

/**
 * Describes the options for dashboard article window refill.
 */
interface DashboardArticleWindowRefillOptions extends FeedSelectionFetchers {
  allowPartialArticleWindowGrowthRef: React.RefObject<boolean>;
  /**
   * The current requested article limit before the refill. The refill advances
   * this by one page (`articlesPerPage`) to bring fresh unread articles into the
   * window without clearing visible content.
   */
  articleLimit: number;
  articlesPerPage: number;
  currentFeedLength: number;
  hasStartedArticleWindowSettlementRef: React.RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: React.RefObject<boolean>;
  isLoadingMoreArticlesRef: React.RefObject<boolean>;
  isRefillingDepletedUnreadWindowRef: React.RefObject<boolean>;
  previousAwaitedFeedLengthRef: React.RefObject<number>;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  setIsLoadingMoreArticles: React.Dispatch<React.SetStateAction<boolean>>;
  setRequestedArticleLimit: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Describes the options for dashboard article window refresh.
 */
interface DashboardArticleWindowRefreshOptions extends FeedSelectionFetchers {
  articleLimit: number;
  articlesPerPage: number;
  isLoadingMoreArticlesRef: React.RefObject<boolean>;
  nextArticleLimit: number;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  setIsLoadingMoreArticles: React.Dispatch<React.SetStateAction<boolean>>;
  setRequestedArticleLimit: React.Dispatch<React.SetStateAction<number>>;
}
/**
 * Describes the dashboard article window reset state.
 */
interface DashboardArticleWindowResetState {
  allowPartialArticleWindowGrowthRef: React.RefObject<boolean>;
  hasStartedArticleWindowSettlementRef: React.RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: React.RefObject<boolean>;
  isLoadingMoreArticlesRef: React.RefObject<boolean>;
  isRefillingDepletedUnreadWindowRef: React.RefObject<boolean>;
  previousAwaitedFeedLengthRef: React.RefObject<number>;
  setHasMoreServerArticles: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoadingMoreArticles: React.Dispatch<React.SetStateAction<boolean>>;
  setRequestedArticleLimit: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Describes the options for reset dashboard article window state.
 */
interface ResetDashboardArticleWindowStateOptions {
  articlesPerPage: number;
  shouldUseArticleWindow: boolean;
}

/**
 * Return the dashboard article window counts.
 * @param options - The options used to return the dashboard article window counts.
 * @returns The dashboard article window counts.
 */
export function getDashboardArticleWindowCounts(
  options: DashboardArticleWindowCountsOptions,
) {
  return {
    articleWindowLimit: options.shouldUseArticleWindow
      ? options.requestedArticleLimit
      : undefined,
    pendingLoadMoreArticleCount:
      options.shouldUseArticleWindow && options.isLoadingMoreArticles
        ? Math.max(0, options.requestedArticleLimit - options.currentFeedLength)
        : 0,
  };
}

/**
 * Process the prefetch next page for current selection.
 * @param nextLimit - The next limit.
 * @param options - The options used to process the prefetch next page for current selection.
 */
export async function prefetchNextPageForCurrentSelection(
  nextLimit: number,
  options: DashboardArticleWindowHelperOptions,
): Promise<void> {
  const {
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    prefetchFeed,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    usePlaceholderData,
  } = options;

  if (usePlaceholderData) {
    return;
  }

  const prefetchOptions: FeedFetchOptions = {
    articleLimit: nextLimit,
    keepExistingFeed: true,
    requestSource: "feed-scroll-load-more",
    skipRefresh: true,
  };

  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    await prefetchAllFeeds(undefined, prefetchOptions);
    return;
  }

  if (selectedFeedUrl) {
    await prefetchFeed(selectedFeedUrl, prefetchOptions);
    return;
  }

  if (selectedCategoryNode) {
    await prefetchCategoryFeeds(selectedCategoryNode, prefetchOptions);
  }
}

/**
 * Process the refill dashboard article window.
 *
 * Advances the article window by one page plus overflow beyond the current
 * limit and re-fetches with `keepExistingFeed: true` so visible content is preserved
 * while the new unread articles arrive. Without `keepExistingFeed`, the cache
 * clears during the fetch, causing an empty-feed flash and triggering the
 * shell-loading skeleton incorrectly.
 *
 * Setting `isLoadingMoreArticlesRef` blocks both the concurrent scroll load-more
 * guard (`shouldBlockArticleWindowLoadMore`) and the pagination-layer backfill
 * (`useBackfillDepletedRevealedPageEffect`) from double-firing while the refill
 * is in-flight. Setting `setRequestedArticleLimit` to the new limit ensures that
 * settlement logic and prefetch calculations use the correct window size after
 * the refill completes.
 *
 * @param options - The options used to process the refill dashboard article window.
 */
export function refillDashboardArticleWindow(
  options: DashboardArticleWindowRefillOptions,
): void {
  const {
    allowPartialArticleWindowGrowthRef,
    articleLimit,
    articlesPerPage,
    currentFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    setIsLoadingMoreArticles,
    setRequestedArticleLimit,
  } = options;

  const nextArticleLimit = resolveNextUnreadRefillArticleLimit(
    articleLimit,
    articlesPerPage,
  );

  isRefillingDepletedUnreadWindowRef.current = true;
  isLoadingMoreArticlesRef.current = true;
  isAwaitingArticleWindowSettlementRef.current = true;
  allowPartialArticleWindowGrowthRef.current = true;
  previousAwaitedFeedLengthRef.current = currentFeedLength;
  hasStartedArticleWindowSettlementRef.current = true;

  setIsLoadingMoreArticles(true);
  setRequestedArticleLimit(nextArticleLimit);

  void refreshCurrentSelection({
    articleLimit: nextArticleLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    /*
     * Preserve visible content while the refill fetch is in-flight.
     * Without this flag the React Query cache is cleared before the new
     * unread articles arrive, causing `currentFeedLength === 0`, which
     * makes `shouldBlockArticleWindowLoadMore` block and forces the shell
     * skeleton to re-render, producing the visible empty-feed flash.
     */
    keepExistingFeed: true,
    requestSource: "feed-scroll-load-more",
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    skipRefresh: true,
  }).finally(() => {
    isRefillingDepletedUnreadWindowRef.current = false;
    isLoadingMoreArticlesRef.current = false;
    setIsLoadingMoreArticles(false);
  });
}
/**
 * Process the reset dashboard article window state.
 * @param state - The state.
 * @param options - The options used to process the reset dashboard article window state.
 */
export function resetDashboardArticleWindowState(
  state: DashboardArticleWindowResetState,
  options: ResetDashboardArticleWindowStateOptions,
): void {
  const {
    allowPartialArticleWindowGrowthRef,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef,
    setHasMoreServerArticles,
    setIsLoadingMoreArticles,
    setRequestedArticleLimit,
  } = state;

  isLoadingMoreArticlesRef.current = false;
  isAwaitingArticleWindowSettlementRef.current = options.shouldUseArticleWindow;
  allowPartialArticleWindowGrowthRef.current = false;
  previousAwaitedFeedLengthRef.current = 0;
  hasStartedArticleWindowSettlementRef.current = false;
  isRefillingDepletedUnreadWindowRef.current = false;
  setIsLoadingMoreArticles(false);
  setRequestedArticleLimit(options.articlesPerPage);
  setHasMoreServerArticles(options.shouldUseArticleWindow);
}

/**
 * Process the schedule dashboard article window refresh.
 * @param options - The options used to process the schedule dashboard article window refresh.
 */
export function scheduleDashboardArticleWindowRefresh(
  options: DashboardArticleWindowRefreshOptions,
): void {
  const {
    articleLimit,
    articlesPerPage,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    isLoadingMoreArticlesRef,
    nextArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    setIsLoadingMoreArticles,
    setRequestedArticleLimit,
  } = options;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void refreshCurrentSelection({
        articleLimit,
        fetchAllFeeds,
        fetchCategoryFeeds,
        fetchFeed,
        keepExistingFeed: true,
        requestSource: "feed-scroll-load-more",
        selectedCategory,
        selectedCategoryNode,
        selectedFeedUrl,
        skipRefresh: true,
      })
        .catch(() => {
          setRequestedArticleLimit((currentLimit) =>
            currentLimit === nextArticleLimit
              ? Math.max(articlesPerPage, currentLimit - articlesPerPage)
              : currentLimit,
          );
        })
        .finally(() => {
          isLoadingMoreArticlesRef.current = false;
          setIsLoadingMoreArticles(false);
        });
    });
  });
}

/**
 * Resolve the next unread-refill article-window limit.
 * @param articleLimit - The current requested article limit.
 * @param articlesPerPage - The configured page size.
 * @returns The next requested limit large enough to replace one page plus overflow.
 */
function resolveNextUnreadRefillArticleLimit(
  articleLimit: number,
  articlesPerPage: number,
) {
  return articleLimit + resolveUnreadRefillThreshold(articlesPerPage);
}
