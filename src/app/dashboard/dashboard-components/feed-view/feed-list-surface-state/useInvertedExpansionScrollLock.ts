import { useCallback, useRef } from "react";

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

interface InvertedExpansionScrollLockRuntimeOptions {
  expandedArticleKey: null | string;
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement | null;
}

type InvertedExpansionScrollLockRuntimeState = ReturnType<
  typeof useInvertedExpansionScrollLockState
>;

interface ReleaseInvertedExpansionScrollLockWithCooldownOptions {
  invertedExpansionScrollLockRef: InvertedExpansionScrollLockRuntimeState["invertedExpansionScrollLockRef"];
  invertedExpansionViewportSnapshotRef: InvertedExpansionScrollLockRuntimeState["invertedExpansionViewportSnapshotRef"];
  releaseInvertedExpansionScrollLock: InvertedExpansionScrollLockRuntimeState["releaseInvertedExpansionScrollLock"];
}

/**
 * Manage the inverted expansion scroll lock.
 * @param options - The options used to manage the inverted expansion scroll lock.
 * @returns The inverted expansion scroll lock state and callbacks.
 */
export function useInvertedExpansionScrollLock(
  options: UseInvertedExpansionScrollLockOptions,
) {
  const { expandedArticleKey, isInvertedScroll, scrollViewport } = options;
  const expansionScrollLockState = useInvertedExpansionScrollLockRuntime({
    expandedArticleKey,
    isInvertedScroll,
    scrollViewport,
  });
  const {
    expansionLockCooldownUntilRef,
    releaseInvertedExpansionScrollLockWithCooldown,
  } = useInvertedExpansionScrollLockRelease(expansionScrollLockState);
  useInvertedExpansionScrollLockLifecycleBindings(
    options,
    expansionScrollLockState,
    releaseInvertedExpansionScrollLockWithCooldown,
  );

  const hasActiveInvertedExpansionScrollLock =
    useHasActiveInvertedExpansionScrollLock(
      expansionLockCooldownUntilRef,
      expansionScrollLockState.invertedExpansionScrollLockRef,
    );

  return {
    hasActiveInvertedExpansionScrollLock,
    releaseInvertedExpansionScrollLock:
      releaseInvertedExpansionScrollLockWithCooldown,
    syncInvertedExpansionScrollLock:
      expansionScrollLockState.syncInvertedExpansionScrollLock,
  };
}

/**
 * Build the callback that reports whether the scroll lock still owns the viewport.
 * @param expansionLockCooldownUntilRef - Tracks the cooldown deadline after a lock release.
 * @param invertedExpansionScrollLockRef - Tracks the active lock state, when one exists.
 * @returns The callback that reports whether the inverted lock is still active.
 */
function useHasActiveInvertedExpansionScrollLock(
  expansionLockCooldownUntilRef: React.RefObject<number>,
  invertedExpansionScrollLockRef: InvertedExpansionScrollLockRuntimeState["invertedExpansionScrollLockRef"],
) {
  return useCallback(() => {
    return (
      invertedExpansionScrollLockRef.current !== null ||
      performance.now() < expansionLockCooldownUntilRef.current
    );
  }, [expansionLockCooldownUntilRef, invertedExpansionScrollLockRef]);
}

/**
 * Wire the viewport snapshot capture and lifecycle effects for inverted expansion locking.
 * @param options - The current expansion state, refs, and callbacks that drive lock lifecycles.
 */
function useInvertedExpansionScrollLockLifecycle(
  options: UseInvertedExpansionScrollLockOptions & {
    invertedExpansionScrollLockRef: InvertedExpansionScrollLockRuntimeState["invertedExpansionScrollLockRef"];
    invertedExpansionViewportSnapshotRef: InvertedExpansionScrollLockRuntimeState["invertedExpansionViewportSnapshotRef"];
    isInvertedScrollRef: InvertedExpansionScrollLockRuntimeState["isInvertedScrollRef"];
    previousCollapsingArticleKeysRef: InvertedExpansionScrollLockRuntimeState["previousCollapsingArticleKeysRef"];
    previousExpandedArticleKeyRef: InvertedExpansionScrollLockRuntimeState["previousExpandedArticleKeyRef"];
    primedUnreadRemovalRef: InvertedExpansionScrollLockRuntimeState["primedUnreadRemovalRef"];
    releaseInvertedExpansionScrollLock: InvertedExpansionScrollLockRuntimeState["releaseInvertedExpansionScrollLock"];
    startInvertedExpansionScrollLock: InvertedExpansionScrollLockRuntimeState["startInvertedExpansionScrollLock"];
    syncInvertedExpansionScrollLock: InvertedExpansionScrollLockRuntimeState["syncInvertedExpansionScrollLock"];
  },
) {
  const { captureInvertedExpansionViewportSnapshot } =
    useInvertedExpansionViewportSnapshot(options.getPreExpandViewportSnapshot);
  useInvertedExpansionScrollLockLifecycles({
    articleFilter: options.articleFilter,
    captureInvertedExpansionViewportSnapshot,
    collapsingArticles: options.collapsingArticles,
    expandedArticleKey: options.expandedArticleKey,
    invertedExpansionScrollLockRef: options.invertedExpansionScrollLockRef,
    invertedExpansionViewportSnapshotRef:
      options.invertedExpansionViewportSnapshotRef,
    isInvertedScroll: options.isInvertedScroll,
    isInvertedScrollRef: options.isInvertedScrollRef,
    onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
    previousCollapsingArticleKeysRef: options.previousCollapsingArticleKeysRef,
    previousExpandedArticleKeyRef: options.previousExpandedArticleKeyRef,
    primedUnreadRemovalRef: options.primedUnreadRemovalRef,
    releaseInvertedExpansionScrollLock:
      options.releaseInvertedExpansionScrollLock,
    scrollViewport: options.scrollViewport,
    startInvertedExpansionScrollLock: options.startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock: options.syncInvertedExpansionScrollLock,
  });
}

/**
 * Bind the lifecycle hooks that keep inverted expansion locking in sync with feed changes.
 * @param options - The public hook options for the current feed surface.
 * @param expansionScrollLockState - The refs and callbacks that back the expansion lock runtime.
 * @param releaseInvertedExpansionScrollLockWithCooldown - The wrapped release callback with cooldown behavior.
 */
function useInvertedExpansionScrollLockLifecycleBindings(
  options: UseInvertedExpansionScrollLockOptions,
  expansionScrollLockState: InvertedExpansionScrollLockRuntimeState,
  releaseInvertedExpansionScrollLockWithCooldown: () => void,
) {
  useInvertedExpansionScrollLockLifecycle({
    articleFilter: options.articleFilter,
    collapsingArticles: options.collapsingArticles,
    expandedArticleKey: options.expandedArticleKey,
    getPreExpandViewportSnapshot: options.getPreExpandViewportSnapshot,
    invertedExpansionScrollLockRef:
      expansionScrollLockState.invertedExpansionScrollLockRef,
    invertedExpansionViewportSnapshotRef:
      expansionScrollLockState.invertedExpansionViewportSnapshotRef,
    isInvertedScroll: options.isInvertedScroll,
    isInvertedScrollRef: expansionScrollLockState.isInvertedScrollRef,
    onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
    previousCollapsingArticleKeysRef:
      expansionScrollLockState.previousCollapsingArticleKeysRef,
    previousExpandedArticleKeyRef:
      expansionScrollLockState.previousExpandedArticleKeyRef,
    primedUnreadRemovalRef: expansionScrollLockState.primedUnreadRemovalRef,
    releaseInvertedExpansionScrollLock:
      releaseInvertedExpansionScrollLockWithCooldown,
    scrollViewport: options.scrollViewport,
    startInvertedExpansionScrollLock:
      expansionScrollLockState.startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock:
      expansionScrollLockState.syncInvertedExpansionScrollLock,
  });
}

/**
 * Build the cooldown-backed release callback from the active expansion lock runtime state.
 * @param expansionScrollLockState - The refs and callbacks that back the expansion lock runtime.
 * @returns The cooldown ref and wrapped release callback for the runtime state.
 */
function useInvertedExpansionScrollLockRelease(
  expansionScrollLockState: InvertedExpansionScrollLockRuntimeState,
) {
  return useReleaseInvertedExpansionScrollLockWithCooldown({
    invertedExpansionScrollLockRef:
      expansionScrollLockState.invertedExpansionScrollLockRef,
    invertedExpansionViewportSnapshotRef:
      expansionScrollLockState.invertedExpansionViewportSnapshotRef,
    releaseInvertedExpansionScrollLock:
      expansionScrollLockState.releaseInvertedExpansionScrollLock,
  });
}

/**
 * Resolve the refs and callbacks that back the inverted expansion scroll lock runtime.
 * @param options - The current expanded-article key, scroll mode, and viewport.
 * @returns The state refs and callbacks that drive the lock machine.
 */
function useInvertedExpansionScrollLockRuntime(
  options: InvertedExpansionScrollLockRuntimeOptions,
) {
  return useInvertedExpansionScrollLockState({
    expandedArticleKey: options.expandedArticleKey,
    isInvertedScroll: options.isInvertedScroll,
    scrollViewport: options.scrollViewport,
  });
}

/**
 * Build the release callback that keeps a short cooldown after an active lock ends.
 * @param options - The lock refs and base release callback for the active feed surface.
 * @returns The cooldown ref and the wrapped release callback.
 */
function useReleaseInvertedExpansionScrollLockWithCooldown(
  options: ReleaseInvertedExpansionScrollLockWithCooldownOptions,
) {
  const {
    invertedExpansionScrollLockRef,
    invertedExpansionViewportSnapshotRef,
    releaseInvertedExpansionScrollLock,
  } = options;
  const expansionLockCooldownUntilRef = useRef(0);
  const releaseInvertedExpansionScrollLockWithCooldown = useCallback(() => {
    if (invertedExpansionScrollLockRef.current !== null) {
      expansionLockCooldownUntilRef.current = performance.now() + 600;
    }

    releaseInvertedExpansionScrollLock();
    invertedExpansionViewportSnapshotRef.current = null;
  }, [
    invertedExpansionScrollLockRef,
    invertedExpansionViewportSnapshotRef,
    releaseInvertedExpansionScrollLock,
  ]);

  return {
    expansionLockCooldownUntilRef,
    releaseInvertedExpansionScrollLockWithCooldown,
  };
}
