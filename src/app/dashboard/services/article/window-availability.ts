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
 *
 * Load-more fetches are background requests (`keepExistingFeed: true`) that bypass
 * `syncLoading`, so `isLoading` never becomes `true` during pagination. The resolver
 * uses `isLoadingMoreArticles` to detect whether a load-more fetch is still in-flight
 * and defers settlement until the fetch completes (signaled by the `.finally()` callback
 * in `scheduleDashboardArticleWindowRefresh`).
 */
export interface ResolveArticleWindowAvailabilityOptions {
  allowPartialFeedGrowth: boolean;
  articlesPerPage?: number;
  currentFeedLength: number;
  currentFilteredFeedLength?: number;
  hasStartedAwaitedWindowSettlement: boolean;
  isAwaitingWindowSettlement: boolean;
  isLoading: boolean;
  isLoadingMoreArticles: boolean;
  preservePartialFilteredWindowAvailability?: boolean;
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
 * Both `isRefillingDepletedUnreadWindow` (server-layer refill) and `isLoadingMoreArticles`
 * (scroll load-more) must be false before a new refill is allowed to prevent races.
 */
export interface ShouldRefillDepletedUnreadWindowOptions {
  articleFilter: string;
  articlesPerPage: number;
  currentFeedLength: number;
  currentFilteredFeedLength: number;
  hasMoreServerArticles: boolean;
  isLoading: boolean;
  isLoadingMoreArticles: boolean;
  isRefillingDepletedUnreadWindow: boolean;
  previousFilteredFeedLength: number;
  shouldUseArticleWindow: boolean;
}

/**
 * Minimum extra article rows required beyond one page to ensure the scroll
 * sentinel stays within IntersectionObserver range on any device.
 *
 * This constant governs both the unread-window refill trigger threshold and the
 * pagination-layer backfill guard. It must not be increased without explicit
 * justification per the Article List Infinite Pagination Contract.
 */
export const MIN_UNREAD_REFILL_OVERFLOW_ARTICLES = 1;

/**
 * Resolve whether the server has more articles available for the current article window.
 *
 * When the dashboard is awaiting settlement of a pagination or refill request, this
 * resolver defers the `hasMoreServerArticles` decision until the fetch completes.
 * Background load-more fetches never set `isLoading`, so the resolver uses
 * `isLoadingMoreArticles` as the in-flight signal. Settlement resolves only after
 * `isLoadingMoreArticles` is cleared by the fetch's `.finally()` callback, ensuring
 * the feed length reflects the server's actual response.
 *
 * @param options - Current article window state used to derive availability.
 * @returns Availability result with `hasMoreServerArticles` and a flag indicating
 *   whether the awaiting-settlement refs should be cleared.
 */
export function resolveArticleWindowAvailability(
  options: ResolveArticleWindowAvailabilityOptions,
): ArticleWindowAvailabilityResult {
  if (!options.shouldUseArticleWindow) {
    return {
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    };
  }

  if (options.isAwaitingWindowSettlement) {
    return resolveAwaitingArticleWindowAvailability(options);
  }

  return resolveSteadyStateArticleWindowAvailability(options);
}

/**
 * Resolve the minimum unread article count required to keep the scroll sentinel
 * within IntersectionObserver range for one-page hydration on any device.
 *
 * The threshold is exactly one page plus the sentinel overflow constant so the
 * refill and backfill systems maintain the same floor across all screen sizes.
 *
 * @param articlesPerPage - The configured articles-per-page for the current session.
 * @returns The inclusive lower bound below which a server refill must be triggered.
 */
export function resolveUnreadRefillThreshold(articlesPerPage: number): number {
  return Math.max(0, articlesPerPage + MIN_UNREAD_REFILL_OVERFLOW_ARTICLES);
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
    isLoadingMoreArticles,
    isRefillingDepletedUnreadWindow,
    previousFilteredFeedLength,
    shouldUseArticleWindow,
  } = options;
  const unreadRefillThreshold = resolveUnreadRefillThreshold(articlesPerPage);

  return (
    articleFilter === "unread" &&
    shouldUseArticleWindow &&
    hasMoreServerArticles &&
    !isLoading &&
    !isLoadingMoreArticles &&
    !isRefillingDepletedUnreadWindow &&
    currentFilteredFeedLength < previousFilteredFeedLength &&
    currentFilteredFeedLength < unreadRefillThreshold &&
    currentFeedLength > 0
  );
}

/**
 * Return whether the awaited fetch has already proven partial article-window
 * growth and therefore more server data still exists.
 * @param options - Current article-window state used to derive availability.
 * @returns Whether partial growth already proves more server data exists.
 */
function hasSatisfiedPartialArticleWindowGrowth(
  options: ResolveArticleWindowAvailabilityOptions,
) {
  return (
    options.allowPartialFeedGrowth &&
    options.currentFeedLength > options.previousFeedLength
  );
}

/**
 * Resolve article-window availability while an awaited server-backed fetch is
 * still settling.
 * @param options - Current article-window state used to derive availability.
 * @returns Availability result for the awaiting-settlement phase.
 */
function resolveAwaitingArticleWindowAvailability(
  options: ResolveArticleWindowAvailabilityOptions,
): ArticleWindowAvailabilityResult {
  if (shouldDeferAwaitedWindowSettlement(options)) {
    return {
      hasMoreServerArticles: options.previousHasMoreServerArticles,
      shouldClearAwaitingWindowSettlement: false,
    };
  }

  if (hasSatisfiedPartialArticleWindowGrowth(options)) {
    return {
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    };
  }

  if (shouldPreservePartialFilteredWindowAvailability(options)) {
    return {
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    };
  }

  return {
    hasMoreServerArticles:
      options.currentFeedLength >= options.requestedArticleLimit,
    shouldClearAwaitingWindowSettlement: true,
  };
}

/**
 * Resolve article-window availability outside of an awaited settlement phase.
 * @param options - Current article-window state used to derive availability.
 * @returns Availability result for the steady-state phase.
 */
function resolveSteadyStateArticleWindowAvailability(
  options: ResolveArticleWindowAvailabilityOptions,
): ArticleWindowAvailabilityResult {
  return {
    hasMoreServerArticles:
      options.currentFeedLength >= options.requestedArticleLimit
        ? true
        : options.previousHasMoreServerArticles,
    shouldClearAwaitingWindowSettlement: false,
  };
}

/**
 * Return whether an awaited article-window settlement must stay pending.
 * @param options - Current article-window state used to derive availability.
 * @returns Whether the awaiting-settlement phase should remain pending.
 */
function shouldDeferAwaitedWindowSettlement(
  options: ResolveArticleWindowAvailabilityOptions,
) {
  if (!options.hasStartedAwaitedWindowSettlement || options.isLoading) {
    return true;
  }

  return (
    options.isLoadingMoreArticles &&
    options.currentFeedLength <= options.previousFeedLength
  );
}

/**
 * Return whether unread filtering should preserve the previous availability
 * signal after a refill restored enough unread rows to keep reading.
 *
 * Marking visible articles as read can swap old read rows for newly fetched
 * unread rows without increasing the total feed array length. In that case,
 * total length alone cannot prove server exhaustion: the unread filtered window
 * reaching the refill threshold proves the reader can continue, so availability
 * must stay armed until a later refill returns fewer than the minimum unread
 * window.
 * @param options - Current article-window state used to derive availability.
 * @returns Whether filtered unread availability should remain true.
 */
function shouldPreservePartialFilteredWindowAvailability(
  options: ResolveArticleWindowAvailabilityOptions,
) {
  const currentFilteredFeedLength =
    options.currentFilteredFeedLength ?? options.currentFeedLength;
  const unreadRefillThreshold = resolveUnreadRefillThreshold(
    options.articlesPerPage ?? 0,
  );

  return (
    options.preservePartialFilteredWindowAvailability === true &&
    options.previousHasMoreServerArticles &&
    options.currentFeedLength > 0 &&
    currentFilteredFeedLength >= unreadRefillThreshold
  );
}
