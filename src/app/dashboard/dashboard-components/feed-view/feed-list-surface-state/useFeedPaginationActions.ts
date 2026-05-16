import { useCallback, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";

import {
  maybeAutoFillViewportNow,
  type MaybeAutoFillViewportOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedPaginationViewportAutoFill";
import {
  resolveNextVisibleCount,
  resolvePaginationBoundaryState,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationRules";
import { resolveUnreadRefillThreshold } from "@/app/dashboard/dashboard-services/article";

/**
 * Describes the options for backfill depleted revealed page effect.
 */
interface BackfillDepletedRevealedPageEffectOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer: boolean;
  feedViewKey: string;
  filteredFeedLength: number;
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  isInvertedScroll: boolean;
  primeInvertedPaginationAnchor: () => void;
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  visibleArticleCountRef: { current: number };
}

/**
 * Describes the options for expand visible window.
 */
interface ExpandVisibleWindowOptions {
  articlesPerPage: number;
  commitVisibleArticleCount: (nextVisibleCount: number) => void;
  filteredFeedLengthRef: { current: number };
  scheduleCachedPageReveal: (nextCount: number) => void;
  visibleArticleCountRef: { current: number };
}
/**
 * Describes the options for has reached standard load boundary.
 */
interface HasReachedStandardLoadBoundaryOptions {
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement | null;
}

/**
 * Describes the options for maybe load inverted next page.
 */
interface MaybeLoadInvertedNextPageOptions {
  currentFilteredFeedLength: number;
  currentVisibleCount: number;
  expandVisibleWindow: () => boolean;
  hasCompletedInvertedServerRevealRef: { current: boolean };
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  /** The last recorded inverted-scroll position, reset to `null` after each
   * server reveal.  Used to gate consecutive server loads: if still `null` the
   * user has not yet moved away from the boundary since the previous reveal, so
   * requestMoreFromServer must not fire even if the boundary is armed. */
  lastInvertedScrollTopRef: { current: null | number };
  primeInvertedPaginationAnchor: () => void;
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  scrollViewport: HTMLElement;
}
/**
 * Describes the options for maybe load next page.
 */
interface MaybeLoadNextPageOptions {
  expandedArticleKey: null | string;
  expandVisibleWindow: () => boolean;
  filteredFeedLengthRef: { current: number };
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasCollapsingArticlesRef: { current: boolean };
  hasCompletedInvertedServerRevealRef: { current: boolean };
  hasReachedStandardLoadBoundary: () => boolean;
  hasUserScrolledRef: { current: boolean };
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: { current: boolean };
  lastInvertedScrollTopRef: { current: null | number };
  primeInvertedPaginationAnchor: () => void;
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  scrollViewport: HTMLElement | null;
  visibleArticleCountRef: { current: number };
}

/**
 * Describes the options for maybe load standard next page.
 */
interface MaybeLoadStandardNextPageOptions {
  currentFilteredFeedLength: number;
  currentVisibleCount: number;
  expandVisibleWindow: () => boolean;
  hasReachedStandardLoadBoundary: () => boolean;
  isStandardLoadBoundaryArmedRef: { current: boolean };
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
}

/**
 * Manage the backfill depleted revealed page effect.
 * @param options - The options used to manage the backfill depleted revealed page effect.
 */
export function useBackfillDepletedRevealedPageEffect(
  options: BackfillDepletedRevealedPageEffectOptions,
) {
  const {
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer,
    feedViewKey,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    isInvertedScroll,
    primeInvertedPaginationAnchor,
    requestMoreFromServer,
    visibleArticleCountRef,
  } = options;
  const previousBackfillScopeRef = useRef(feedViewKey);
  const previousBackfillFilteredFeedLengthRef = useRef(filteredFeedLength);
  const maybeBackfillDepletedRevealedPage = useCallback(() => {
    const previousFilteredFeedLength =
      previousBackfillFilteredFeedLengthRef.current;

    if (
      !canLoadMoreFromServer ||
      hasPendingServerRevealRef.current ||
      hasRequestedServerLoadRef.current
    ) {
      return;
    }

    const currentVisibleCount = visibleArticleCountRef.current;
    const unreadRefillThreshold = resolveUnreadRefillThreshold(articlesPerPage);
    const hasDepletedRevealedWindow =
      articleFilter === "unread"
        ? filteredFeedLength < unreadRefillThreshold
        : filteredFeedLength < currentVisibleCount;

    if (
      !hasDepletedRevealedWindow ||
      filteredFeedLength >= previousFilteredFeedLength
    ) {
      return;
    }

    if (isInvertedScroll) {
      primeInvertedPaginationAnchor();
    }

    void requestMoreFromServer({ isViewportRefill: true });
  }, [
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    isInvertedScroll,
    primeInvertedPaginationAnchor,
    requestMoreFromServer,
    visibleArticleCountRef,
  ]);

  useLayoutEffect(() => {
    if (previousBackfillScopeRef.current !== feedViewKey) {
      previousBackfillScopeRef.current = feedViewKey;
      previousBackfillFilteredFeedLengthRef.current = filteredFeedLength;
      return;
    }

    maybeBackfillDepletedRevealedPage();
    previousBackfillFilteredFeedLengthRef.current = filteredFeedLength;
  }, [feedViewKey, filteredFeedLength, maybeBackfillDepletedRevealedPage]);
}
/**
 * Manage the expand visible window.
 * @param options - The options used to manage the expand visible window.
 * @returns The expand visible window state and callbacks.
 */
export function useExpandVisibleWindow(options: ExpandVisibleWindowOptions) {
  const {
    articlesPerPage,
    commitVisibleArticleCount,
    filteredFeedLengthRef,
    scheduleCachedPageReveal,
    visibleArticleCountRef,
  } = options;
  return useCallback(
    (immediate = false, requestedVisibleCount?: number) => {
      const currentCount = visibleArticleCountRef.current;
      const currentFilteredFeedLength = filteredFeedLengthRef.current;
      const nextVisibleCount =
        typeof requestedVisibleCount === "number" &&
        Number.isFinite(requestedVisibleCount)
          ? Math.min(
              Math.max(requestedVisibleCount, currentCount),
              currentFilteredFeedLength,
            )
          : resolveNextVisibleCount({
              articlesPerPage,
              currentVisibleCount: currentCount,
              filteredFeedLength: currentFilteredFeedLength,
            });

      if (nextVisibleCount === currentCount) {
        return false;
      }

      if (immediate) {
        // Auto-fill uses immediate commit: no skeleton delay for viewport refills.
        commitVisibleArticleCount(nextVisibleCount);
      } else {
        // Scroll-triggered expansion: show skeletons before revealing real articles
        // so every pagination transition (cached or server) looks identical.
        scheduleCachedPageReveal(nextVisibleCount);
      }
      return nextVisibleCount > currentCount;
    },
    [
      articlesPerPage,
      commitVisibleArticleCount,
      filteredFeedLengthRef,
      scheduleCachedPageReveal,
      visibleArticleCountRef,
    ],
  );
}

/**
 * Manage the has reached standard load boundary.
 * @param options - The options used to manage the has reached standard load boundary.
 * @returns The has reached standard load boundary state and callbacks.
 */
export function useHasReachedStandardLoadBoundary(
  options: HasReachedStandardLoadBoundaryOptions,
) {
  return useCallback(() => {
    if (!options.scrollViewport || options.isInvertedScroll) {
      return false;
    }

    return resolvePaginationBoundaryState({
      isInvertedScroll: false,
      scrollViewport: options.scrollViewport,
    }).hasReachedBoundary;
  }, [options.isInvertedScroll, options.scrollViewport]);
}
/**
 * Manage the maybe auto fill viewport.
 * @param options - The options used to manage the maybe auto fill viewport.
 * @returns The maybe auto fill viewport state and callbacks.
 */
export function useMaybeAutoFillViewport(
  options: MaybeAutoFillViewportOptions,
) {
  const {
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer,
    expandedArticleKey,
    expandVisibleWindow,
    filteredFeedLengthRef,
    hasActiveInvertedExpansionScrollLock,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasUserScrolledRef,
    isInitialLoading,
    isInvertedScroll,
    isStandardViewportRefillActiveRef,
    lastAutoFillListHeightRef,
    requestMoreFromServer,
    scrollViewport,
    standardViewportRefillTargetVisibleCountRef,
    visibleArticleCountRef,
  } = options;
  return useCallback(
    (
      committedListHeight?: number,
      allowOwnedTargetContinuationWithoutLocalBacklog?: boolean,
    ) => {
      maybeAutoFillViewportNow({
        allowOwnedTargetContinuationWithoutLocalBacklog,
        articleFilter,
        articlesPerPage,
        canLoadMoreFromServer,
        committedListHeight,
        expandedArticleKey,
        expandVisibleWindow,
        filteredFeedLengthRef,
        hasActiveInvertedExpansionScrollLock,
        hasPendingServerRevealRef,
        hasRequestedServerLoadRef,
        hasUserScrolledRef,
        isInitialLoading,
        isInvertedScroll,
        isStandardViewportRefillActiveRef,
        lastAutoFillListHeightRef,
        requestMoreFromServer,
        scrollViewport,
        standardViewportRefillTargetVisibleCountRef,
        visibleArticleCountRef,
      });
    },
    [
      articleFilter,
      articlesPerPage,
      canLoadMoreFromServer,
      expandedArticleKey,
      expandVisibleWindow,
      filteredFeedLengthRef,
      hasActiveInvertedExpansionScrollLock,
      hasPendingServerRevealRef,
      hasRequestedServerLoadRef,
      hasUserScrolledRef,
      isInitialLoading,
      isInvertedScroll,
      isStandardViewportRefillActiveRef,
      lastAutoFillListHeightRef,
      standardViewportRefillTargetVisibleCountRef,
      requestMoreFromServer,
      scrollViewport,
      visibleArticleCountRef,
    ],
  );
}

/**
 * Manage the maybe load next page.
 * @param options - The options used to manage the maybe load next page.
 * @returns The maybe load next page state and callbacks.
 */
export function useMaybeLoadNextPage(options: MaybeLoadNextPageOptions) {
  const {
    expandedArticleKey,
    expandVisibleWindow,
    filteredFeedLengthRef,
    hasActiveInvertedExpansionScrollLock,
    hasCollapsingArticlesRef,
    hasCompletedInvertedServerRevealRef,
    hasReachedStandardLoadBoundary,
    hasUserScrolledRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    lastInvertedScrollTopRef,
    primeInvertedPaginationAnchor,
    requestMoreFromServer,
    scrollViewport,
    visibleArticleCountRef,
  } = options;
  return useCallback(
    (_trigger: "scroll" | "sentinel") => {
      if (
        expandedArticleKey !== null ||
        (isInvertedScroll && hasActiveInvertedExpansionScrollLock()) ||
        !scrollViewport ||
        !hasUserScrolledRef.current ||
        hasCollapsingArticlesRef.current
      ) {
        return;
      }

      const currentVisibleCount = visibleArticleCountRef.current;
      const currentFilteredFeedLength = filteredFeedLengthRef.current;

      if (isInvertedScroll) {
        maybeLoadInvertedNextPage({
          currentFilteredFeedLength,
          currentVisibleCount,
          expandVisibleWindow,
          hasCompletedInvertedServerRevealRef,
          isInvertedLoadBoundaryArmedRef,
          lastInvertedScrollTopRef,
          primeInvertedPaginationAnchor,
          requestMoreFromServer,
          scrollViewport,
        });
        return;
      }

      maybeLoadStandardNextPage({
        currentFilteredFeedLength,
        currentVisibleCount,
        expandVisibleWindow,
        hasReachedStandardLoadBoundary,
        isStandardLoadBoundaryArmedRef,
        requestMoreFromServer,
      });
    },
    [
      expandedArticleKey,
      expandVisibleWindow,
      filteredFeedLengthRef,
      hasActiveInvertedExpansionScrollLock,
      hasCollapsingArticlesRef,
      hasCompletedInvertedServerRevealRef,
      hasReachedStandardLoadBoundary,
      hasUserScrolledRef,
      isInvertedLoadBoundaryArmedRef,
      isInvertedScroll,
      isStandardLoadBoundaryArmedRef,
      lastInvertedScrollTopRef,
      primeInvertedPaginationAnchor,
      requestMoreFromServer,
      scrollViewport,
      visibleArticleCountRef,
    ],
  );
}
/**
 * Process the maybe load inverted next page.
 * @param options - The options used to process the maybe load inverted next page.
 */
function maybeLoadInvertedNextPage(options: MaybeLoadInvertedNextPageOptions) {
  const hasReachedInvertedLoadBoundary = resolvePaginationBoundaryState({
    isInvertedScroll: true,
    scrollViewport: options.scrollViewport,
  }).hasReachedBoundary;
  if (
    !hasReachedInvertedLoadBoundary ||
    !options.isInvertedLoadBoundaryArmedRef.current
  ) {
    return;
  }

  if (options.currentVisibleCount >= options.currentFilteredFeedLength) {
    // Require proof that the user has moved away from the boundary since the
    // previous reveal before issuing another server request.  The position ref
    // is reset to null by completePendingServerReveal and only advances when
    // the user genuinely scrolls or gestures away, so a null value here means
    // the user is still pinned at the top boundary and no away-intent has been
    // recorded yet.
    //
    // NOTE: This gate must be evaluated before primeInvertedPaginationAnchor() is
    // called.  Priming the anchor runs syncInvertedPaginationAnchor(), which can
    // write a new non-null value into lastInvertedScrollTopRef.current — this
    // would silently bypass the null guard and trigger a spurious server request
    // for a user who has never left the boundary.
    if (
      options.hasCompletedInvertedServerRevealRef.current &&
      options.lastInvertedScrollTopRef.current === null
    ) {
      return;
    }

    options.primeInvertedPaginationAnchor();
    const didRequestMore = options.requestMoreFromServer();
    if (didRequestMore) {
      options.isInvertedLoadBoundaryArmedRef.current = false;
    }
    return;
  }

  options.primeInvertedPaginationAnchor();
  flushSync(() => {
    const didExpandVisibleWindow = options.expandVisibleWindow();
    if (didExpandVisibleWindow) {
      options.isInvertedLoadBoundaryArmedRef.current = false;
    }
  });
}

/**
 * Expand the visible article window or request more articles from the server when
 * the scroll sentinel reaches the standard load boundary.
 *
 * If the user has already seen all locally cached articles
 * (`currentVisibleCount >= currentFilteredFeedLength`), a server request is
 * issued. Otherwise the visible
 * window expands locally from the cache. Either action disarms the boundary until the
 * sentinel re-enters the load zone.
 *
 * @param options - Current pagination state and callbacks for boundary detection,
 *   window expansion, and server load requests.
 */
function maybeLoadStandardNextPage(options: MaybeLoadStandardNextPageOptions) {
  if (
    !options.hasReachedStandardLoadBoundary() ||
    !options.isStandardLoadBoundaryArmedRef.current
  ) {
    return;
  }

  if (options.currentVisibleCount >= options.currentFilteredFeedLength) {
    if (options.requestMoreFromServer()) {
      options.isStandardLoadBoundaryArmedRef.current = false;
    }
    return;
  }

  if (options.expandVisibleWindow()) {
    options.isStandardLoadBoundaryArmedRef.current = false;
  }
}
