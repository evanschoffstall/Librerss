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
 * Resolves whether the current dashboard selection can still paginate from the server.
 *
 * The controller should only mark the source exhausted after a server-backed fetch for
 * the active requested limit settles with fewer items than requested. Local optimistic
 * read-state changes must preserve the prior availability signal.
 * @param root0
 * @param root0.allowPartialFeedGrowth
 * @param root0.currentFeedLength
 * @param root0.hasStartedAwaitedWindowSettlement
 * @param root0.isAwaitingWindowSettlement
 * @param root0.isLoading
 * @param root0.previousFeedLength
 * @param root0.previousHasMoreServerArticles
 * @param root0.requestedArticleLimit
 * @param root0.shouldUseArticleWindow
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
 * Prevents load-more from starting before the live article window is ready.
 * @param root0
 * @param root0.currentFeedLength
 * @param root0.hasMoreServerArticles
 * @param root0.isCategoriesLoading
 * @param root0.isLoadingMoreArticles
 * @param root0.shouldUseArticleWindow
 */
export function shouldBlockArticleWindowLoadMore({
  currentFeedLength,
  hasMoreServerArticles,
  isCategoriesLoading,
  isLoadingMoreArticles,
  shouldUseArticleWindow,
}: ShouldBlockArticleWindowLoadMoreOptions) {
  return (
    !shouldUseArticleWindow ||
    isCategoriesLoading ||
    currentFeedLength === 0 ||
    !hasMoreServerArticles ||
    isLoadingMoreArticles
  );
}

/**
 * Determines whether the controller should refill an unread window that local
 * read-state changes have emptied.
 * @param root0
 * @param root0.articleFilter
 * @param root0.articlesPerPage
 * @param root0.currentFeedLength
 * @param root0.currentFilteredFeedLength
 * @param root0.hasMoreServerArticles
 * @param root0.isLoading
 * @param root0.isRefillingDepletedUnreadWindow
 * @param root0.shouldUseArticleWindow
 */
export function shouldRefillDepletedUnreadWindow({
  articleFilter,
  articlesPerPage,
  currentFeedLength,
  currentFilteredFeedLength,
  hasMoreServerArticles,
  isLoading,
  isRefillingDepletedUnreadWindow,
  shouldUseArticleWindow,
}: ShouldRefillDepletedUnreadWindowOptions) {
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
 * Keeps one page plus a minimal overflow article buffered before unread refills.
 *
 * This matches the feed viewport contract: do not chase the server just because
 * local read-state updates removed a few visible rows. Refill only when the unread
 * window has fallen below one configured page and its smallest extra overflow.
 * @param articlesPerPage
 */
function resolveUnreadRefillThreshold(articlesPerPage: number) {
  return Math.max(0, articlesPerPage + MIN_UNREAD_REFILL_OVERFLOW_ARTICLES);
}
