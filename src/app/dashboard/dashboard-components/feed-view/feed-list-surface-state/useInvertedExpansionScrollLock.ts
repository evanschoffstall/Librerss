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
 * Preserves article position while inverted feeds expand, collapse, or remove rows.
 *
 * The feed surface relies on a transient scroll lock during layout-changing row
 * transitions so the active article does not visually jump when the underlying
 * Radix viewport recalculates its height.
 */
export function useInvertedExpansionScrollLock({
  articleFilter,
  collapsingArticles,
  expandedArticleKey,
  getPreExpandViewportSnapshot,
  isInvertedScroll,
  onClaimInvertedScrollOwnership,
  scrollViewport,
}: UseInvertedExpansionScrollLockOptions) {
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
