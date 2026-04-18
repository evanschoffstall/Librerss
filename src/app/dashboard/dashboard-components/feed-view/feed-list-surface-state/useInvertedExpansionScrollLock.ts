import { useCallback } from "react";

import type {
  ArticleViewportSnapshot,
  CollapsingArticles,
} from "@/app/dashboard/display-types";

import {
  useInvertedExpansionScrollLockLifecycles,
  useInvertedExpansionScrollLockState,
  useInvertedExpansionViewportSnapshot,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockLifecycle";

export interface UseInvertedExpansionScrollLockOptions {
  articleFilter: string;
  collapsingArticles: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  getPreExpandViewportSnapshot: (
    articleKey: string,
  ) => ArticleViewportSnapshot | null;
  isInvertedScroll: boolean;
  onClaimInvertedScrollOwnership: () => void;
  scrollViewport: HTMLElement | null;
}

/**
 * Manage the inverted expansion scroll lock.
 * @param options - The options used to manage the inverted expansion scroll lock.
 * @returns The inverted expansion scroll lock state and callbacks.
 */
export function useInvertedExpansionScrollLock(
  options: UseInvertedExpansionScrollLockOptions,
) {
  const {
    articleFilter,
    collapsingArticles,
    expandedArticleKey,
    getPreExpandViewportSnapshot,
    isInvertedScroll,
    onClaimInvertedScrollOwnership,
    scrollViewport,
  } = options;
  const {
    invertedExpansionScrollLockRef,
    invertedExpansionViewportSnapshotRef,
    isInvertedScrollRef,
    previousCollapsingArticleKeysRef,
    previousExpandedArticleKeyRef,
    primedUnreadRemovalRef,
    releaseInvertedExpansionScrollLock,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
  } = useInvertedExpansionScrollLockState({
    expandedArticleKey,
    isInvertedScroll,
    scrollViewport,
  });
  const { captureInvertedExpansionViewportSnapshot } =
    useInvertedExpansionViewportSnapshot(getPreExpandViewportSnapshot);
  useInvertedExpansionScrollLockLifecycles({
    articleFilter,
    captureInvertedExpansionViewportSnapshot,
    collapsingArticles,
    expandedArticleKey,
    invertedExpansionScrollLockRef,
    invertedExpansionViewportSnapshotRef,
    isInvertedScroll,
    isInvertedScrollRef,
    onClaimInvertedScrollOwnership,
    previousCollapsingArticleKeysRef,
    previousExpandedArticleKeyRef,
    primedUnreadRemovalRef,
    releaseInvertedExpansionScrollLock,
    scrollViewport,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
  });

  /** Reports whether the scroll lock currently owns the viewport. */
  const hasActiveInvertedExpansionScrollLock = useCallback(() => {
    return invertedExpansionScrollLockRef.current !== null;
  }, [invertedExpansionScrollLockRef]);

  return {
    hasActiveInvertedExpansionScrollLock,
    releaseInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
  };
}
