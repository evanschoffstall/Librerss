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
 * Inputs used to decide whether a locally depleted unread window should be refilled.
 *
 * When local read-state updates empty the unread filter, the feed surface swaps to the
 * empty state and the list-level pagination hook no longer has a mounted viewport.
 */
export interface ShouldRefillDepletedUnreadWindowOptions {
  articleFilter: string;
  currentFeedLength: number;
  currentFilteredFeedLength: number;
  hasMoreServerArticles: boolean;
  isLoading: boolean;
  isRefillingDepletedUnreadWindow: boolean;
  shouldUseArticleWindow: boolean;
}

/**
 * Resolves whether the current dashboard selection can still paginate from the server.
 *
 * The controller should only mark the source exhausted after a server-backed fetch for
 * the active requested limit settles with fewer items than requested. Local optimistic
 * read-state changes must preserve the prior availability signal.
 */
export function resolveArticleWindowAvailability({
  allowPartialFeedGrowth,
  currentFeedLength,
  hasStartedAwaitedWindowSettlement,
  isAwaitingWindowSettlement,
  isLoading,
  previousFeedLength,
  previousHasMoreServerArticles,
  requestedArticleLimit,
  shouldUseArticleWindow,
}: ResolveArticleWindowAvailabilityOptions): ArticleWindowAvailabilityResult {
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
 * Determines whether the controller should refill an unread window that local
 * read-state changes have emptied.
 */
export function shouldRefillDepletedUnreadWindow({
  articleFilter,
  currentFeedLength,
  currentFilteredFeedLength,
  hasMoreServerArticles,
  isLoading,
  isRefillingDepletedUnreadWindow,
  shouldUseArticleWindow,
}: ShouldRefillDepletedUnreadWindowOptions) {
  return (
    articleFilter === "unread" &&
    shouldUseArticleWindow &&
    hasMoreServerArticles &&
    !isLoading &&
    !isRefillingDepletedUnreadWindow &&
    currentFilteredFeedLength === 0 &&
    currentFeedLength > 0
  );
}