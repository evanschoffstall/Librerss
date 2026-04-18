/**
 * Derived server-availability state for the dashboard article window.
 *
 * `shouldClearAwaitingWindowSettlement` tells the controller that an awaited
 * server-backed fetch has fully settled and the waiting flags can be reset.
 */
export interface ArticleWindowAvailabilityResult {
  hasMoreServerArticles: boolean;
  shouldClearAwaitingWindowSettlement: boolean;
}

/**
 * Inputs required to decide whether the dashboard can still request more server articles.
 *
 * Local unread removals can shrink the rendered feed below the requested window size
 * without proving that the backend is exhausted. This resolver keeps the previous
 * availability state until an awaited server-backed window fetch actually settles.
 */
export interface ResolveArticleWindowAvailabilityOptions {
  allowPartialFeedGrowth: boolean;
  currentFeedLength: number;
  hasStartedAwaitedWindowSettlement: boolean;
  isAwaitingWindowSettlement: boolean;
  isLoading: boolean;
  previousFeedLength: number;
  previousHasMoreServerArticles: boolean;
  requestedArticleLimit: number;
  shouldUseArticleWindow: boolean;
}

/**
 * Inputs used to decide whether dashboard load-more should be ignored.
 *
 * During the initial live dashboard boot the feed surface can briefly expose a
 * mounted load-more boundary before the first category tree and article window
 * have fully settled. Ignoring load-more during that phase prevents the
 * requested article limit from inflating before the first live page is ready.
 */
export interface ShouldBlockArticleWindowLoadMoreOptions {
  currentFeedLength: number;
  hasMoreServerArticles: boolean;
  isCategoriesLoading: boolean;
  isLoadingMoreArticles: boolean;
  shouldUseArticleWindow: boolean;
}

/**
 * Inputs used to decide whether a locally depleted unread window should be refilled.
 *
 * When local read-state updates empty the unread filter, the feed surface swaps to the
 * empty state and the list-level pagination hook no longer has a mounted viewport.
 */
export interface ShouldRefillDepletedUnreadWindowOptions {
  articleFilter: string;
  articlesPerPage: number;
  currentFeedLength: number;
  currentFilteredFeedLength: number;
  hasMoreServerArticles: boolean;
  isLoading: boolean;
  isRefillingDepletedUnreadWindow: boolean;
  shouldUseArticleWindow: boolean;
}

const MIN_UNREAD_REFILL_OVERFLOW_ARTICLES = 1;

/**
 * Resolve the article window availability.
 * @param options - The options used to resolve the article window availability.
 * @returns The article window availability.
 */
export function resolveArticleWindowAvailability(
  options: ResolveArticleWindowAvailabilityOptions,
): ArticleWindowAvailabilityResult {
  const {
    allowPartialFeedGrowth,
    currentFeedLength,
    hasStartedAwaitedWindowSettlement,
    isAwaitingWindowSettlement,
    isLoading,
    previousFeedLength,
    previousHasMoreServerArticles,
    requestedArticleLimit,
    shouldUseArticleWindow,
  } = options;
  if (!shouldUseArticleWindow) {
    return {
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    };
  }

  if (isAwaitingWindowSettlement) {
    if (!hasStartedAwaitedWindowSettlement || isLoading) {
      return {
        hasMoreServerArticles: previousHasMoreServerArticles,
        shouldClearAwaitingWindowSettlement: false,
      };
    }

    if (allowPartialFeedGrowth && currentFeedLength > previousFeedLength) {
      return {
        hasMoreServerArticles: true,
        shouldClearAwaitingWindowSettlement: true,
      };
    }

    return {
      hasMoreServerArticles: currentFeedLength >= requestedArticleLimit,
      shouldClearAwaitingWindowSettlement: true,
    };
  }

  if (currentFeedLength >= requestedArticleLimit) {
    return {
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    };
  }

  return {
    hasMoreServerArticles: previousHasMoreServerArticles,
    shouldClearAwaitingWindowSettlement: false,
  };
}

/**
 * Return whether should block article window load more.
 * @param options - The options used to return whether should block article window load more.
 * @returns Whether should block article window load more.
 */
export function shouldBlockArticleWindowLoadMore(
  options: ShouldBlockArticleWindowLoadMoreOptions,
) {
  const {
    currentFeedLength,
    hasMoreServerArticles,
    isCategoriesLoading,
    isLoadingMoreArticles,
    shouldUseArticleWindow,
  } = options;
  return (
    !shouldUseArticleWindow ||
    isCategoriesLoading ||
    currentFeedLength === 0 ||
    !hasMoreServerArticles ||
    isLoadingMoreArticles
  );
}

/**
 * Return whether should refill depleted unread window.
 * @param options - The options used to return whether should refill depleted unread window.
 * @returns Whether should refill depleted unread window.
 */
export function shouldRefillDepletedUnreadWindow(
  options: ShouldRefillDepletedUnreadWindowOptions,
) {
  const {
    articleFilter,
    articlesPerPage,
    currentFeedLength,
    currentFilteredFeedLength,
    hasMoreServerArticles,
    isLoading,
    isRefillingDepletedUnreadWindow,
    shouldUseArticleWindow,
  } = options;
  const unreadRefillThreshold = resolveUnreadRefillThreshold(articlesPerPage);

  return (
    articleFilter === "unread" &&
    shouldUseArticleWindow &&
    hasMoreServerArticles &&
    !isLoading &&
    !isRefillingDepletedUnreadWindow &&
    currentFilteredFeedLength < unreadRefillThreshold &&
    currentFeedLength > 0
  );
}

/**
 * Resolve the unread refill threshold.
 * @param articlesPerPage - The articles per page.
 * @returns The unread refill threshold.
 */
function resolveUnreadRefillThreshold(articlesPerPage: number) {
  return Math.max(0, articlesPerPage + MIN_UNREAD_REFILL_OVERFLOW_ARTICLES);
}
