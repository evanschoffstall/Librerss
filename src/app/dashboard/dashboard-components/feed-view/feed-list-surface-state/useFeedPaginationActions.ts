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

/**
 * @param options
 * @param options.articleFilter
 * @param options.articlesPerPage
 * @param options.canLoadMoreFromServer
 * @param options.filteredFeedLength
 * @param options.hasPendingServerRevealRef
 * @param options.hasPendingServerRevealRef.current
 * @param options.hasRequestedServerLoadRef
 * @param options.hasRequestedServerLoadRef.current
 * @param options.isInvertedScroll
 * @param options.primeInvertedPaginationAnchor
 * @param options.requestMoreFromServer
 * @param options.visibleArticleCountRef
 * @param options.visibleArticleCountRef.current
 */
export function useBackfillDepletedRevealedPageEffect(options: {
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
}) {
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
 * @param options
 * @param options.articlesPerPage
 * @param options.commitVisibleArticleCount
 * @param options.filteredFeedLengthRef
 * @param options.filteredFeedLengthRef.current
 * @param options.scheduleCachedPageReveal
 * @param options.visibleArticleCountRef
 * @param options.visibleArticleCountRef.current
 */
export function useExpandVisibleWindow(options: {
  articlesPerPage: number;
  commitVisibleArticleCount: (nextVisibleCount: number) => void;
  filteredFeedLengthRef: { current: number };
  scheduleCachedPageReveal: (nextCount: number) => void;
  visibleArticleCountRef: { current: number };
}) {
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
 * @param options
 * @param options.isInvertedScroll
 * @param options.scrollViewport
 */
export function useHasReachedStandardLoadBoundary(options: {
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement | null;
}) {
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
 * @param options
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
 * @param options
 * @param options.expandVisibleWindow
 * @param options.filteredFeedLengthRef
 * @param options.filteredFeedLengthRef.current
 * @param options.hasCollapsingArticlesRef
 * @param options.hasCollapsingArticlesRef.current
 * @param options.hasReachedStandardLoadBoundary
 * @param options.hasUserScrolledRef
 * @param options.hasUserScrolledRef.current
 * @param options.isInvertedLoadBoundaryArmedRef
 * @param options.isInvertedLoadBoundaryArmedRef.current
 * @param options.isInvertedScroll
 * @param options.isStandardLoadBoundaryArmedRef
 * @param options.isStandardLoadBoundaryArmedRef.current
 * @param options.primeInvertedPaginationAnchor
 * @param options.requestMoreFromServer
 * @param options.scrollViewport
 * @param options.visibleArticleCountRef
 * @param options.visibleArticleCountRef.current
 */
export function useMaybeLoadNextPage(options: {
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
}) {
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
 * @param options
 * @param options.currentFilteredFeedLength
 * @param options.currentVisibleCount
 * @param options.expandVisibleWindow
 * @param options.isInvertedLoadBoundaryArmedRef
 * @param options.isInvertedLoadBoundaryArmedRef.current
 * @param options.primeInvertedPaginationAnchor
 * @param options.requestMoreFromServer
 * @param options.scrollViewport
 */
function maybeLoadInvertedNextPage(options: {
  currentFilteredFeedLength: number;
  currentVisibleCount: number;
  expandVisibleWindow: () => boolean;
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  primeInvertedPaginationAnchor: () => void;
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  scrollViewport: HTMLElement;
}) {
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
 * @param options
 * @param options.currentFilteredFeedLength
 * @param options.currentVisibleCount
 * @param options.expandVisibleWindow
 * @param options.hasReachedStandardLoadBoundary
 * @param options.isStandardLoadBoundaryArmedRef
 * @param options.isStandardLoadBoundaryArmedRef.current
 * @param options.requestMoreFromServer
 */
function maybeLoadStandardNextPage(options: {
  currentFilteredFeedLength: number;
  currentVisibleCount: number;
  expandVisibleWindow: () => boolean;
  hasReachedStandardLoadBoundary: () => boolean;
  isStandardLoadBoundaryArmedRef: { current: boolean };
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
}) {
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
 * @param articlesPerPage
 */
function resolveUnreadRefillThreshold(articlesPerPage: number) {
  return Math.max(0, articlesPerPage + MIN_UNREAD_REFILL_OVERFLOW_ARTICLES);
}
