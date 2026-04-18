import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import type {
  InvertedExpansionScrollLockStarter,
  InvertedExpansionViewportSnapshotCapture,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockContracts";
import type {
  ArticleViewportSnapshot,
  CollapsingArticles,
} from "@/app/dashboard/display-types";

import { useInvertedExpansionLockMachine } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedExpansionLockMachine";
import { useInvertedExpansionScrollLockEvents } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockEvents";
import {
  ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS,
  ARTICLE_REMOVAL_ANIMATION_MS,
  ARTICLE_SCROLL_RESTORE_BUFFER_MS,
  findInvertedExpansionHeaderAnchor,
  findInvertedExpansionLockAnchor,
  findVisibleInvertedRemovalAnchorArticleKey,
  getViewportOffsetTop,
  type InvertedExpansionViewportSnapshot,
  type PrimedUnreadRemovalState,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

interface ExpandedArticleScrollLockLifecycleOptions {
  captureInvertedExpansionViewportSnapshot: InvertedExpansionViewportSnapshotCapture;
  expandedArticleKey: null | string;
  invertedExpansionViewportSnapshotRef: React.RefObject<InvertedExpansionViewportSnapshot | null>;
  isInvertedScroll: boolean;
  onClaimInvertedScrollOwnership: () => void;
  previousExpandedArticleKeyRef: React.RefObject<null | string>;
  startInvertedExpansionScrollLock: InvertedExpansionScrollLockStarter;
}
interface InvertedExpansionScrollLockLifecycleOptions {
  articleFilter: string;
  captureInvertedExpansionViewportSnapshot: InvertedExpansionViewportSnapshotCapture;
  collapsingArticles: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  invertedExpansionScrollLockRef: React.RefObject<unknown>;
  invertedExpansionViewportSnapshotRef: React.RefObject<InvertedExpansionViewportSnapshot | null>;
  isInvertedScroll: boolean;
  isInvertedScrollRef: React.RefObject<boolean>;
  onClaimInvertedScrollOwnership: () => void;
  previousCollapsingArticleKeysRef: React.RefObject<string[]>;
  previousExpandedArticleKeyRef: React.RefObject<null | string>;
  primedUnreadRemovalRef: React.RefObject<null | PrimedUnreadRemovalState>;
  releaseInvertedExpansionScrollLock: () => void;
  scrollViewport: HTMLElement | null;
  startInvertedExpansionScrollLock: InvertedExpansionScrollLockStarter;
  syncInvertedExpansionScrollLock: () => void;
}

interface InvertedExpansionScrollLockRuntimeOptions {
  articleFilter: string;
  captureInvertedExpansionViewportSnapshot: InvertedExpansionViewportSnapshotCapture;
  invertedExpansionScrollLockRef: React.RefObject<unknown>;
  invertedExpansionViewportSnapshotRef: React.RefObject<InvertedExpansionViewportSnapshot | null>;
  isInvertedScrollRef: React.RefObject<boolean>;
  onClaimInvertedScrollOwnership: () => void;
  prepareInvertedUnreadRemovalScrollLock: (
    articleKeys: Iterable<string>,
    lockOptions?: { primeInteraction?: boolean },
  ) => void;
  releaseInvertedExpansionScrollLock: () => void;
  scrollViewport: HTMLElement | null;
  startInvertedExpansionScrollLock: InvertedExpansionScrollLockStarter;
  syncInvertedExpansionScrollLock: () => void;
}

interface InvertedExpansionScrollLockStateOptions {
  expandedArticleKey: null | string;
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement | null;
}
interface PrepareInvertedUnreadRemovalScrollLockOptions {
  captureInvertedExpansionViewportSnapshot: (
    articleKey: string,
  ) => InvertedExpansionViewportSnapshot | null;
  isInvertedScrollRef: React.RefObject<boolean>;
  onClaimInvertedScrollOwnership: () => void;
  primedUnreadRemovalRef: React.RefObject<null | PrimedUnreadRemovalState>;
  startInvertedExpansionScrollLock: (
    articleKey: null | string,
    snapshot: InvertedExpansionViewportSnapshot | null,
    mode: "collapsing" | "expand" | "stable",
    releaseAt?: null | number,
  ) => void;
}

interface UnreadRemovalScrollLockLifecycleOptions {
  articleFilter: string;
  collapsingArticles: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  isInvertedScroll: boolean;
  prepareInvertedUnreadRemovalScrollLock: (
    articleKeys: Iterable<string>,
    lockOptions?: { primeInteraction?: boolean },
  ) => void;
  previousCollapsingArticleKeysRef: React.RefObject<string[]>;
  primedUnreadRemovalRef: React.RefObject<null | PrimedUnreadRemovalState>;
}
/**
 * Manage the expanded article scroll lock lifecycle.
 * @param options - The options used to manage the expanded article scroll lock lifecycle.
 */
export function useExpandedArticleScrollLockLifecycle(
  options: ExpandedArticleScrollLockLifecycleOptions,
) {
  useLayoutEffect(() => {
    const previousExpandedArticleKey =
      options.previousExpandedArticleKeyRef.current;
    const didExpandedArticleChange =
      previousExpandedArticleKey !== options.expandedArticleKey;

    options.previousExpandedArticleKeyRef.current = options.expandedArticleKey;

    if (!options.isInvertedScroll || !didExpandedArticleChange) {
      return;
    }

    options.onClaimInvertedScrollOwnership();

    const nextSnapshot = options.expandedArticleKey
      ? options.invertedExpansionViewportSnapshotRef.current?.articleKey ===
        options.expandedArticleKey
        ? options.invertedExpansionViewportSnapshotRef.current
        : options.captureInvertedExpansionViewportSnapshot(
            options.expandedArticleKey,
          )
      : previousExpandedArticleKey &&
          options.invertedExpansionViewportSnapshotRef.current?.articleKey ===
            previousExpandedArticleKey
        ? options.invertedExpansionViewportSnapshotRef.current
        : null;

    if (options.expandedArticleKey) {
      options.invertedExpansionViewportSnapshotRef.current = nextSnapshot;
    }

    options.startInvertedExpansionScrollLock(
      options.expandedArticleKey ?? previousExpandedArticleKey,
      nextSnapshot,
      options.expandedArticleKey === null ? "collapsing" : "expand",
      options.expandedArticleKey === null
        ? performance.now() +
            ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS +
            ARTICLE_SCROLL_RESTORE_BUFFER_MS
        : null,
    );
  }, [
    options,
    options.captureInvertedExpansionViewportSnapshot,
    options.expandedArticleKey,
    options.invertedExpansionViewportSnapshotRef,
    options.isInvertedScroll,
    options.onClaimInvertedScrollOwnership,
    options.previousExpandedArticleKeyRef,
    options.startInvertedExpansionScrollLock,
  ]);
}

/**
 * Manage the inverted expansion scroll lock lifecycles.
 * @param options - The options used to manage the inverted expansion scroll lock lifecycles.
 */
export function useInvertedExpansionScrollLockLifecycles(
  options: InvertedExpansionScrollLockLifecycleOptions,
) {
  const prepareInvertedUnreadRemovalScrollLock =
    usePrepareInvertedUnreadRemovalScrollLock({
      captureInvertedExpansionViewportSnapshot:
        options.captureInvertedExpansionViewportSnapshot,
      isInvertedScrollRef: options.isInvertedScrollRef,
      onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
      primedUnreadRemovalRef: options.primedUnreadRemovalRef,
      startInvertedExpansionScrollLock:
        options.startInvertedExpansionScrollLock,
    });

  useExpandedArticleScrollLockLifecycle({
    captureInvertedExpansionViewportSnapshot:
      options.captureInvertedExpansionViewportSnapshot,
    expandedArticleKey: options.expandedArticleKey,
    invertedExpansionViewportSnapshotRef:
      options.invertedExpansionViewportSnapshotRef,
    isInvertedScroll: options.isInvertedScroll,
    onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
    previousExpandedArticleKeyRef: options.previousExpandedArticleKeyRef,
    startInvertedExpansionScrollLock: options.startInvertedExpansionScrollLock,
  });
  useUnreadRemovalScrollLockLifecycle({
    articleFilter: options.articleFilter,
    collapsingArticles: options.collapsingArticles,
    expandedArticleKey: options.expandedArticleKey,
    isInvertedScroll: options.isInvertedScroll,
    prepareInvertedUnreadRemovalScrollLock,
    previousCollapsingArticleKeysRef: options.previousCollapsingArticleKeysRef,
    primedUnreadRemovalRef: options.primedUnreadRemovalRef,
  });
  useInvertedExpansionScrollLockRuntime({
    articleFilter: options.articleFilter,
    captureInvertedExpansionViewportSnapshot:
      options.captureInvertedExpansionViewportSnapshot,
    invertedExpansionScrollLockRef: options.invertedExpansionScrollLockRef,
    invertedExpansionViewportSnapshotRef:
      options.invertedExpansionViewportSnapshotRef,
    isInvertedScrollRef: options.isInvertedScrollRef,
    onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
    prepareInvertedUnreadRemovalScrollLock,
    releaseInvertedExpansionScrollLock:
      options.releaseInvertedExpansionScrollLock,
    scrollViewport: options.scrollViewport,
    startInvertedExpansionScrollLock: options.startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock: options.syncInvertedExpansionScrollLock,
  });
}

/**
 * Manage the inverted expansion scroll lock runtime.
 * @param options - The options used to manage the inverted expansion scroll lock runtime.
 */
export function useInvertedExpansionScrollLockRuntime(
  options: InvertedExpansionScrollLockRuntimeOptions,
) {
  useInvertedExpansionScrollLockEvents({
    articleFilter: options.articleFilter,
    captureInvertedExpansionViewportSnapshot:
      options.captureInvertedExpansionViewportSnapshot,
    invertedExpansionScrollLockRef: options.invertedExpansionScrollLockRef,
    isInvertedScrollRef: options.isInvertedScrollRef,
    onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
    prepareInvertedUnreadRemovalScrollLock:
      options.prepareInvertedUnreadRemovalScrollLock,
    scrollViewport: options.scrollViewport,
    startInvertedExpansionScrollLock: options.startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock: options.syncInvertedExpansionScrollLock,
    viewportSnapshotRef: options.invertedExpansionViewportSnapshotRef,
  });

  useEffect(() => {
    return () => {
      options.releaseInvertedExpansionScrollLock();
      options.invertedExpansionViewportSnapshotRef.current = null;
    };
  }, [
    options,
    options.invertedExpansionViewportSnapshotRef,
    options.releaseInvertedExpansionScrollLock,
  ]);
}
/**
 * Manage the inverted expansion scroll lock state.
 * @param options - The options used to manage the inverted expansion scroll lock state.
 * @returns The inverted expansion scroll lock state state and callbacks.
 */
export function useInvertedExpansionScrollLockState(
  options: InvertedExpansionScrollLockStateOptions,
) {
  const invertedExpansionViewportSnapshotRef =
    useRef<InvertedExpansionViewportSnapshot | null>(null);
  const isInvertedScrollRef = useRef(options.isInvertedScroll);
  const expandedArticleKeyRef = useRef(options.expandedArticleKey);
  const previousExpandedArticleKeyRef = useRef(options.expandedArticleKey);
  const previousCollapsingArticleKeysRef = useRef<string[]>([]);
  const primedUnreadRemovalRef = useRef<null | PrimedUnreadRemovalState>(null);

  isInvertedScrollRef.current = options.isInvertedScroll;
  expandedArticleKeyRef.current = options.expandedArticleKey;

  return {
    expandedArticleKeyRef,
    invertedExpansionViewportSnapshotRef,
    isInvertedScrollRef,
    previousCollapsingArticleKeysRef,
    previousExpandedArticleKeyRef,
    primedUnreadRemovalRef,
    ...useInvertedExpansionLockMachine({
      expandedArticleKeyRef,
      isInvertedScrollRef,
      scrollViewport: options.scrollViewport,
    }),
  };
}

/**
 * Manage the inverted expansion viewport snapshot.
 * @param getPreExpandViewportSnapshot - The callback that pre expand viewport snapshot.
 * @returns The inverted expansion viewport snapshot state and callbacks.
 */
export function useInvertedExpansionViewportSnapshot(
  getPreExpandViewportSnapshot: (
    articleKey: string,
  ) => ArticleViewportSnapshot | null,
) {
  const clearInvertedExpansionViewportSnapshot = useCallback(() => {
    return null;
  }, []);

  const captureInvertedExpansionViewportSnapshot = useCallback(
    (articleKey: string) => {
      const sharedSnapshot = getPreExpandViewportSnapshot(articleKey);
      if (sharedSnapshot) {
        return {
          articleHeaderViewportOffsetTop:
            sharedSnapshot.articleHeaderViewportOffsetTop,
          articleKey: sharedSnapshot.articleKey,
          viewport: sharedSnapshot.viewport,
          viewportScrollTop: sharedSnapshot.viewportScrollTop,
        } satisfies InvertedExpansionViewportSnapshot;
      }

      const articleElement = findInvertedExpansionLockAnchor(articleKey);
      const viewport =
        articleElement?.closest<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        ) ?? null;
      if (!articleElement || !viewport) {
        return null;
      }

      return {
        articleHeaderViewportOffsetTop: getViewportOffsetTop(
          findInvertedExpansionHeaderAnchor(articleKey) ?? articleElement,
          viewport,
        ),
        articleKey,
        viewport,
        viewportScrollTop: viewport.scrollTop,
      } satisfies InvertedExpansionViewportSnapshot;
    },
    [getPreExpandViewportSnapshot],
  );

  return {
    captureInvertedExpansionViewportSnapshot,
    clearInvertedExpansionViewportSnapshot,
  };
}
/**
 * Manage the prepare inverted unread removal scroll lock.
 * @param options - The options used to manage the prepare inverted unread removal scroll lock.
 * @returns The prepare inverted unread removal scroll lock state and callbacks.
 */
export function usePrepareInvertedUnreadRemovalScrollLock(
  options: PrepareInvertedUnreadRemovalScrollLockOptions,
) {
  return useCallback(
    (
      excludedArticleKeys: Iterable<string>,
      lockOptions?: { primeInteraction?: boolean },
    ) => {
      if (!options.isInvertedScrollRef.current) {
        return;
      }

      options.onClaimInvertedScrollOwnership();
      const excludedArticleKeySet = new Set(excludedArticleKeys);
      const anchorArticleKey = findVisibleInvertedRemovalAnchorArticleKey(
        excludedArticleKeySet,
      );
      const releaseAt =
        performance.now() +
        ARTICLE_REMOVAL_ANIMATION_MS +
        ARTICLE_SCROLL_RESTORE_BUFFER_MS;

      if (!anchorArticleKey) {
        const pinToBottomReleaseAt =
          performance.now() + ARTICLE_REMOVAL_ANIMATION_MS + 5_000;
        if (lockOptions?.primeInteraction) {
          options.primedUnreadRemovalRef.current = {
            articleKeys: excludedArticleKeySet,
            expiresAt: pinToBottomReleaseAt,
          };
        }
        options.startInvertedExpansionScrollLock(
          null,
          null,
          "stable",
          pinToBottomReleaseAt,
        );
        return;
      }

      const snapshot =
        options.captureInvertedExpansionViewportSnapshot(anchorArticleKey);
      if (!snapshot) {
        return;
      }

      if (lockOptions?.primeInteraction) {
        options.primedUnreadRemovalRef.current = {
          articleKeys: excludedArticleKeySet,
          expiresAt: releaseAt,
        };
      }

      options.startInvertedExpansionScrollLock(
        anchorArticleKey,
        snapshot,
        "stable",
        releaseAt,
      );
    },
    [options],
  );
}

/**
 * Manage the unread removal scroll lock lifecycle.
 * @param options - The options used to manage the unread removal scroll lock lifecycle.
 */
export function useUnreadRemovalScrollLockLifecycle(
  options: UnreadRemovalScrollLockLifecycleOptions,
) {
  useLayoutEffect(() => {
    const collapsingArticleKeys = Object.keys(options.collapsingArticles);
    const previousCollapsingArticleKeys =
      options.previousCollapsingArticleKeysRef.current;
    options.previousCollapsingArticleKeysRef.current = collapsingArticleKeys;

    if (
      !options.isInvertedScroll ||
      options.articleFilter !== "unread" ||
      options.expandedArticleKey !== null ||
      collapsingArticleKeys.length === 0
    ) {
      return;
    }

    const previousCollapsingArticleKeySet = new Set(
      previousCollapsingArticleKeys,
    );
    const newlyCollapsingArticleKeys = collapsingArticleKeys.filter(
      (articleKey) => !previousCollapsingArticleKeySet.has(articleKey),
    );
    if (newlyCollapsingArticleKeys.length === 0) {
      return;
    }

    const primedUnreadRemoval = options.primedUnreadRemovalRef.current;
    if (
      primedUnreadRemoval &&
      performance.now() < primedUnreadRemoval.expiresAt &&
      newlyCollapsingArticleKeys.every((articleKey) =>
        primedUnreadRemoval.articleKeys.has(articleKey),
      )
    ) {
      return;
    }

    options.prepareInvertedUnreadRemovalScrollLock(newlyCollapsingArticleKeys);
  }, [
    options,
    options.articleFilter,
    options.collapsingArticles,
    options.expandedArticleKey,
    options.isInvertedScroll,
    options.prepareInvertedUnreadRemovalScrollLock,
    options.previousCollapsingArticleKeysRef,
    options.primedUnreadRemovalRef,
  ]);
}
