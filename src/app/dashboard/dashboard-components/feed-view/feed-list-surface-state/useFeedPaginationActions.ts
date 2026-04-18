import { useCallback, useLayoutEffect } from "react";
import { flushSync } from "react-dom";

import {
  maybeAutoFillViewportNow,
  type MaybeAutoFillViewportOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedPaginationViewportAutoFill";
import {
  resolveNextVisibleCount,
  resolvePaginationBoundaryState,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationRules";

const MIN_UNREAD_REFILL_OVERFLOW_ARTICLES = 1;
interface BackfillDepletedRevealedPageEffectOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer: boolean;
  filteredFeedLength: number;
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  isInvertedScroll: boolean;
  primeInvertedPaginationAnchor: () => void;
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  visibleArticleCountRef: { current: number };
}

interface ExpandVisibleWindowOptions {
  articlesPerPage: number;
  commitVisibleArticleCount: (nextVisibleCount: number) => void;
  filteredFeedLengthRef: { current: number };
  scheduleCachedPageReveal: (nextCount: number) => void;
  visibleArticleCountRef: { current: number };
}
interface HasReachedStandardLoadBoundaryOptions {
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement | null;
}

interface MaybeLoadInvertedNextPageOptions {
  currentFilteredFeedLength: number;
  currentVisibleCount: number;
  expandVisibleWindow: () => boolean;
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  primeInvertedPaginationAnchor: () => void;
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  scrollViewport: HTMLElement;
}
interface MaybeLoadNextPageOptions {
  expandVisibleWindow: () => boolean;
  filteredFeedLengthRef: { current: number };
  hasCollapsingArticlesRef: { current: boolean };
  hasReachedStandardLoadBoundary: () => boolean;
  hasUserScrolledRef: { current: boolean };
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: { current: boolean };
  primeInvertedPaginationAnchor: () => void;
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  scrollViewport: HTMLElement | null;
  visibleArticleCountRef: { current: number };
}

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
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    isInvertedScroll,
    primeInvertedPaginationAnchor,
    requestMoreFromServer,
    visibleArticleCountRef,
  } = options;
  const maybeBackfillDepletedRevealedPage = useCallback(() => {
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

    if (!hasDepletedRevealedWindow) {
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
    maybeBackfillDepletedRevealedPage();
  }, [filteredFeedLength, maybeBackfillDepletedRevealedPage]);
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
    (immediate = false) => {
      const currentCount = visibleArticleCountRef.current;
      const currentFilteredFeedLength = filteredFeedLengthRef.current;
      const nextVisibleCount = resolveNextVisibleCount({
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
    canLoadMoreFromServer,
    expandVisibleWindow,
    filteredFeedLengthRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasUserScrolledRef,
    isInitialLoading,
    isInvertedScroll,
    isStandardViewportRefillActiveRef,
    lastAutoFillListHeightRef,
    requestMoreFromServer,
    scrollViewport,
    visibleArticleCountRef,
  } = options;
  return useCallback(
    (committedListHeight?: number) => {
      maybeAutoFillViewportNow({
        articleFilter,
        canLoadMoreFromServer,
        committedListHeight,
        expandVisibleWindow,
        filteredFeedLengthRef,
        hasPendingServerRevealRef,
        hasRequestedServerLoadRef,
        hasUserScrolledRef,
        isInitialLoading,
        isInvertedScroll,
        isStandardViewportRefillActiveRef,
        lastAutoFillListHeightRef,
        requestMoreFromServer,
        scrollViewport,
        visibleArticleCountRef,
      });
    },
    [
      articleFilter,
      canLoadMoreFromServer,
      expandVisibleWindow,
      filteredFeedLengthRef,
      hasPendingServerRevealRef,
      hasRequestedServerLoadRef,
      hasUserScrolledRef,
      isInitialLoading,
      isInvertedScroll,
      isStandardViewportRefillActiveRef,
      lastAutoFillListHeightRef,
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
  return useCallback(
    (_trigger: "scroll" | "sentinel") => {
      if (
        !options.scrollViewport ||
        !options.hasUserScrolledRef.current ||
        options.hasCollapsingArticlesRef.current
      ) {
        return;
      }

      const currentVisibleCount = options.visibleArticleCountRef.current;
      const currentFilteredFeedLength = options.filteredFeedLengthRef.current;

      if (options.isInvertedScroll) {
        maybeLoadInvertedNextPage({
          currentFilteredFeedLength,
          currentVisibleCount,
          expandVisibleWindow: options.expandVisibleWindow,
          isInvertedLoadBoundaryArmedRef:
            options.isInvertedLoadBoundaryArmedRef,
          primeInvertedPaginationAnchor: options.primeInvertedPaginationAnchor,
          requestMoreFromServer: options.requestMoreFromServer,
          scrollViewport: options.scrollViewport,
        });
        return;
      }

      maybeLoadStandardNextPage({
        currentFilteredFeedLength,
        currentVisibleCount,
        expandVisibleWindow: options.expandVisibleWindow,
        hasReachedStandardLoadBoundary: options.hasReachedStandardLoadBoundary,
        isStandardLoadBoundaryArmedRef: options.isStandardLoadBoundaryArmedRef,
        requestMoreFromServer: options.requestMoreFromServer,
      });
    },
    [
      options.expandVisibleWindow,
      options.filteredFeedLengthRef,
      options.hasCollapsingArticlesRef,
      options.hasReachedStandardLoadBoundary,
      options.hasUserScrolledRef,
      options.isInvertedLoadBoundaryArmedRef,
      options.isInvertedScroll,
      options.isStandardLoadBoundaryArmedRef,
      options.primeInvertedPaginationAnchor,
      options.requestMoreFromServer,
      options.scrollViewport,
      options.visibleArticleCountRef,
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

  options.primeInvertedPaginationAnchor();

  if (options.currentVisibleCount >= options.currentFilteredFeedLength) {
    if (options.requestMoreFromServer()) {
      options.isInvertedLoadBoundaryArmedRef.current = false;
    }
    return;
  }

  flushSync(() => {
    if (options.expandVisibleWindow()) {
      options.isInvertedLoadBoundaryArmedRef.current = false;
    }
  });
}

/**
 * Process the maybe load standard next page.
 * @param options - The options used to process the maybe load standard next page.
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

/**
 * Resolve the unread refill threshold.
 * @param articlesPerPage - The articles per page.
 * @returns The unread refill threshold.
 */
function resolveUnreadRefillThreshold(articlesPerPage: number) {
  return Math.max(0, articlesPerPage + MIN_UNREAD_REFILL_OVERFLOW_ARTICLES);
}
