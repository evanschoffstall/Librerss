"use client";

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
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

/**
 * Describes the article window ref collection.
 */
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

/** Inputs forwarded to the unread-window refill runner with previous render state. */
interface UnreadWindowRefillEffectOptions extends UseUnreadWindowRefillOptions {
  previousFilteredFeedLength: number;
}

/**
 * Describes the options for use article window availability.
 */
interface UseArticleWindowAvailabilityOptions {
  allowPartialArticleWindowGrowthRef: RefObject<boolean>;
  articlesPerPage: number;
  currentFeedLength: number;
  currentFilteredFeedLength: number;
  hasMoreServerArticles: boolean;
  hasStartedArticleWindowSettlementRef: RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: RefObject<boolean>;
  isLoading: boolean;
  isLoadingMoreArticles: boolean;
  isLoadingMoreArticlesRef: RefObject<boolean>;
  preservePartialFilteredWindowAvailability?: boolean;
  previousAwaitedFeedLengthRef: RefObject<number>;
  requestedArticleLimit: number;
  setHasMoreServerArticles: Dispatch<SetStateAction<boolean>>;
  setIsLoadingMoreArticles: Dispatch<SetStateAction<boolean>>;
  shouldUseArticleWindow: boolean;
}

/**
 * Describes the options for use reset article window.
 */
interface UseResetArticleWindowOptions extends ArticleWindowRefCollection {
  articleFilter: string;
  articlesPerPage: number;
  selectedCategory: string;
  setHasMoreServerArticles: Dispatch<SetStateAction<boolean>>;
  setIsLoadingMoreArticles: Dispatch<SetStateAction<boolean>>;
  setRequestedArticleLimit: Dispatch<SetStateAction<number>>;
  shouldUseArticleWindow: boolean;
}

/**
 * Describes the options for use unread window refill.
 */
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
  /**
   * Reactive state mirror of `isLoadingMoreArticlesRef`. Passed to
   * `shouldRefillDepletedUnreadWindow` to block a new server refill from
   * firing while a concurrent scroll load-more fetch is already in-flight.
   */
  isLoadingMoreArticles: boolean;
  isLoadingMoreArticlesRef: RefObject<boolean>;
  isRefillingDepletedUnreadWindowRef: RefObject<boolean>;
  previousAwaitedFeedLengthRef: RefObject<number>;
  requestedArticleLimit: number;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  setIsLoadingMoreArticles: Dispatch<SetStateAction<boolean>>;
  setRequestedArticleLimit: Dispatch<SetStateAction<number>>;
  shouldUseArticleWindow: boolean;
}

/**
 * Synchronize derived `hasMoreServerArticles` state with the article window lifecycle.
 *
 * Runs `resolveArticleWindowAvailability` on every render where a dependency changes and
 * propagates the result into React state and mutable refs. The `isLoadingMoreArticles`
 * state value (not just the ref) is included as a dependency so the effect re-runs when
 * the load-more fetch completes (`.finally()` clears the state), allowing settlement to
 * resolve with the correct post-fetch feed length.
 *
 * @param options - Refs, state values, and setters for the article window lifecycle.
 */
export function useArticleWindowAvailability(
  options: UseArticleWindowAvailabilityOptions,
): void {
  useEffect(
    () => {
      runArticleWindowAvailabilityEffect(options);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dependencies are listed explicitly off `options.*` so the hook can stay a thin lifecycle wrapper without duplicating the option shape.
    [
      options.allowPartialArticleWindowGrowthRef,
      options.articlesPerPage,
      options.currentFeedLength,
      options.currentFilteredFeedLength,
      options.hasMoreServerArticles,
      options.hasStartedArticleWindowSettlementRef,
      options.isAwaitingArticleWindowSettlementRef,
      options.isLoading,
      options.isLoadingMoreArticles,
      options.isLoadingMoreArticlesRef,
      options.preservePartialFilteredWindowAvailability,
      options.previousAwaitedFeedLengthRef,
      options.requestedArticleLimit,
      options.setHasMoreServerArticles,
      options.setIsLoadingMoreArticles,
      options.shouldUseArticleWindow,
    ],
  );
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
 *
 * The hook is intentionally a thin lifecycle wrapper around
 * `runUnreadWindowRefillEffect`. The dependency array enumerates each consumed option
 * field directly off `options.*` so React still tracks every reactive input without
 * recreating a destructuring block that mirrors the dependency list (which previously
 * tripped both length and clone-detection thresholds).
 *
 * @param options - The options used to manage the unread window refill.
 */
export function useUnreadWindowRefill(
  options: UseUnreadWindowRefillOptions,
): void {
  const previousFilteredFeedLengthRef = useRef(
    options.currentFilteredFeedLength,
  );
  const refillScopeRef = useRef(
    getUnreadWindowRefillScope(options.articleFilter, options.selectedCategory),
  );

  useEffect(
    () => {
      const refillScope = getUnreadWindowRefillScope(
        options.articleFilter,
        options.selectedCategory,
      );

      if (refillScopeRef.current !== refillScope) {
        refillScopeRef.current = refillScope;
        previousFilteredFeedLengthRef.current =
          options.currentFilteredFeedLength;
        return;
      }

      runUnreadWindowRefillEffect({
        ...options,
        previousFilteredFeedLength: previousFilteredFeedLengthRef.current,
      });
      previousFilteredFeedLengthRef.current = options.currentFilteredFeedLength;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dependencies are listed explicitly off `options.*` to keep the hook free of a destructuring block that would duplicate this list and trip jscpd.
    [
      options.allowPartialArticleWindowGrowthRef,
      options.articleFilter,
      options.articlesPerPage,
      options.currentFeedLength,
      options.currentFilteredFeedLength,
      options.fetchAllFeeds,
      options.fetchCategoryFeeds,
      options.fetchFeed,
      options.hasMoreServerArticles,
      options.hasStartedArticleWindowSettlementRef,
      options.isAwaitingArticleWindowSettlementRef,
      options.isLoading,
      options.isLoadingMoreArticles,
      options.isLoadingMoreArticlesRef,
      options.isRefillingDepletedUnreadWindowRef,
      options.previousAwaitedFeedLengthRef,
      options.requestedArticleLimit,
      options.selectedCategory,
      options.selectedCategoryNode,
      options.selectedFeedUrl,
      options.setIsLoadingMoreArticles,
      options.setRequestedArticleLimit,
      options.shouldUseArticleWindow,
    ],
  );
}

/**
 * Clears the refs that track an awaited article-window settlement.
 * @param allowPartialArticleWindowGrowthRef - Ref that tracks whether partial feed growth is allowed.
 * @param hasStartedArticleWindowSettlementRef - Ref that tracks whether settlement has started.
 * @param isAwaitingArticleWindowSettlementRef - Ref that tracks whether settlement is still awaited.
 */
function clearAwaitingArticleWindowSettlement(
  allowPartialArticleWindowGrowthRef: RefObject<boolean>,
  hasStartedArticleWindowSettlementRef: RefObject<boolean>,
  isAwaitingArticleWindowSettlementRef: RefObject<boolean>,
): void {
  isAwaitingArticleWindowSettlementRef.current = false;
  allowPartialArticleWindowGrowthRef.current = false;
  hasStartedArticleWindowSettlementRef.current = false;
}

/**
 * Clears the loading-more state mirror and backing ref together.
 * @param isLoadingMoreArticlesRef - Ref mirror for the loading-more state.
 * @param setIsLoadingMoreArticles - Setter for the reactive loading-more state.
 */
function clearLoadingMoreArticles(
  isLoadingMoreArticlesRef: RefObject<boolean>,
  setIsLoadingMoreArticles: Dispatch<SetStateAction<boolean>>,
): void {
  isLoadingMoreArticlesRef.current = false;
  setIsLoadingMoreArticles(false);
}

/**
 * Return the state boundary where unread-refill comparisons remain meaningful.
 * @param articleFilter - The active article filter.
 * @param selectedCategory - The active category or feed key.
 * @returns A stable key for resetting previous unread-count tracking.
 */
function getUnreadWindowRefillScope(
  articleFilter: string,
  selectedCategory: string,
) {
  return `${articleFilter}:${selectedCategory}`;
}

/**
 * Runs one availability synchronization pass for the article window lifecycle.
 * @param options - Refs, state values, and setters for the article window lifecycle.
 */
function runArticleWindowAvailabilityEffect(
  options: UseArticleWindowAvailabilityOptions,
): void {
  const nextAvailability = resolveArticleWindowAvailability({
    allowPartialFeedGrowth: options.allowPartialArticleWindowGrowthRef.current,
    articlesPerPage: options.articlesPerPage,
    currentFeedLength: options.currentFeedLength,
    currentFilteredFeedLength: options.currentFilteredFeedLength,
    hasStartedAwaitedWindowSettlement:
      options.hasStartedArticleWindowSettlementRef.current,
    isAwaitingWindowSettlement:
      options.isAwaitingArticleWindowSettlementRef.current,
    isLoading: options.isLoading,
    isLoadingMoreArticles: options.isLoadingMoreArticles,
    preservePartialFilteredWindowAvailability:
      options.preservePartialFilteredWindowAvailability,
    previousFeedLength: options.previousAwaitedFeedLengthRef.current,
    previousHasMoreServerArticles: options.hasMoreServerArticles,
    requestedArticleLimit: options.requestedArticleLimit,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });

  if (nextAvailability.shouldClearAwaitingWindowSettlement) {
    clearAwaitingArticleWindowSettlement(
      options.allowPartialArticleWindowGrowthRef,
      options.hasStartedArticleWindowSettlementRef,
      options.isAwaitingArticleWindowSettlementRef,
    );
  }

  if (!options.shouldUseArticleWindow) {
    clearLoadingMoreArticles(
      options.isLoadingMoreArticlesRef,
      options.setIsLoadingMoreArticles,
    );
  }

  if (
    nextAvailability.hasMoreServerArticles !== options.hasMoreServerArticles
  ) {
    options.setHasMoreServerArticles(nextAvailability.hasMoreServerArticles);
  }

  if (
    options.isLoadingMoreArticlesRef.current &&
    !options.isLoading &&
    !options.isAwaitingArticleWindowSettlementRef.current
  ) {
    clearLoadingMoreArticles(
      options.isLoadingMoreArticlesRef,
      options.setIsLoadingMoreArticles,
    );
  }
}

/**
 * Run a single depleted-unread-window refill pass for the dashboard article window.
 *
 * Extracted from `useUnreadWindowRefill` so the effect body lives outside the hook's
 * dependency-array surface. Keeping the imperative refill logic in a free function
 * eliminates the structural duplication that previously existed between the hook's
 * destructured option block and its `useEffect` dependency list, and keeps the hook
 * itself short enough to remain readable as a thin lifecycle wrapper.
 *
 * The function reads `isLoadingMoreArticlesRef.current` synchronously instead of
 * trusting the reactive `isLoadingMoreArticles` state alone, because the state update
 * lags the ref mutation by one render and a second refill could otherwise start before
 * the first one's loading flag is reflected in state.
 *
 * @param options - The full hook options forwarded from `useUnreadWindowRefill`.
 */
function runUnreadWindowRefillEffect(
  options: UnreadWindowRefillEffectOptions,
): void {
  if (
    !shouldRefillDepletedUnreadWindow({
      articleFilter: options.articleFilter,
      articlesPerPage: options.articlesPerPage,
      currentFeedLength: options.currentFeedLength,
      currentFilteredFeedLength: options.currentFilteredFeedLength,
      hasMoreServerArticles: options.hasMoreServerArticles,
      isLoading: options.isLoading,
      isLoadingMoreArticles:
        options.isLoadingMoreArticlesRef.current ||
        options.isLoadingMoreArticles,
      isRefillingDepletedUnreadWindow:
        options.isRefillingDepletedUnreadWindowRef.current,
      previousFilteredFeedLength: options.previousFilteredFeedLength,
      shouldUseArticleWindow: options.shouldUseArticleWindow,
    })
  ) {
    return;
  }

  refillDashboardArticleWindow({
    allowPartialArticleWindowGrowthRef:
      options.allowPartialArticleWindowGrowthRef,
    articleLimit: options.requestedArticleLimit,
    articlesPerPage: options.articlesPerPage,
    currentFeedLength: options.currentFeedLength,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    hasStartedArticleWindowSettlementRef:
      options.hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef:
      options.isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticlesRef: options.isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef:
      options.isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef: options.previousAwaitedFeedLengthRef,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    setIsLoadingMoreArticles: options.setIsLoadingMoreArticles,
    setRequestedArticleLimit: options.setRequestedArticleLimit,
  });
}
