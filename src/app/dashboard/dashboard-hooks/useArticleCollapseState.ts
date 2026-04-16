"use client";

import type React from "react";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Article } from "@/lib/core";

import {
  ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS,
  ARTICLE_REMOVAL_ANIMATION_MS,
} from "@/app/dashboard/dashboard-hooks/articleCollapseConstants";
import { createCollapseScrollRestoreRuntime } from "@/app/dashboard/dashboard-hooks/articleCollapseScrollRestore";
import {
  type ArticleViewportSnapshot,
  captureArticleViewportSnapshot,
  isRestorableArticleViewportSnapshot,
  removeCollapsingArticle,
} from "@/app/dashboard/dashboard-hooks/articleCollapseViewport";
import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { type ArticleRemovalAnimationMode } from "@/app/dashboard/display-types";

export type CollapsingArticles = Partial<
  Record<string, CollapsingArticleState>
>;

interface CollapsingArticleState {
  article: Article;
  index: number;
  mode: ArticleRemovalAnimationMode;
}

type RemovalAnimationTimeoutId = number;

interface UseArticleCollapseStateOptions {
  feed: Article[];
}

/** Returns the mounted lifetime for a staged unread-removal mode. */
export function getArticleRemovalAnimationDuration(
  mode: ArticleRemovalAnimationMode,
) {
  return mode === "de-expanding"
    ? ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS
    : ARTICLE_REMOVAL_ANIMATION_MS;
}

/**
 * Tracks staged article-removal rows and restores the pre-expand scroll anchor.
 *
 * This isolates DOM snapshotting, exit-row bookkeeping, and viewport scroll
 * restoration from the higher-level article mutation workflow.
 */
export function useArticleCollapseState({
  feed,
}: UseArticleCollapseStateOptions) {
  const collapseState = useArticleCollapseLifecycleState();
  const snapshotState = useArticleViewportSnapshotState(
    collapseState.articleViewportSnapshotRef,
  );
  const scrollRestoreState = useArticleCollapseScrollRestoreState({
    articleViewportSnapshotRef: collapseState.articleViewportSnapshotRef,
    clearPreExpandSnapshot: snapshotState.clearPreExpandSnapshot,
    collapseScrollRestoreCleanupRef:
      collapseState.collapseScrollRestoreCleanupRef,
    setIsCollapseScrollRestoreActive:
      collapseState.setIsCollapseScrollRestoreActive,
  });
  const removalAnimationState = useArticleRemovalAnimationState({
    collapseRemovalTimeoutsRef: collapseState.collapseRemovalTimeoutsRef,
    feed,
  });

  return {
    cancelCollapseScrollRestore: scrollRestoreState.cancelCollapseScrollRestore,
    capturePreExpandSnapshot: snapshotState.capturePreExpandSnapshot,
    clearRemovalAnimation: removalAnimationState.clearRemovalAnimation,
    collapsingArticles: removalAnimationState.collapsingArticles,
    getPreExpandViewportSnapshot: snapshotState.getPreExpandViewportSnapshot,
    isCollapseScrollRestoreActive: collapseState.isCollapseScrollRestoreActive,
    restoreCollapseScrollPosition:
      scrollRestoreState.restoreCollapseScrollPosition,
    startRemovalAnimation: removalAnimationState.startRemovalAnimation,
  };
}

function resolveCollapseScrollSnapshot(
  articleKey: string,
  storedSnapshot: ArticleViewportSnapshot | null,
) {
  const liveSnapshot = captureArticleViewportSnapshot(articleKey);
  const matchingStoredSnapshot =
    storedSnapshot?.articleKey === articleKey ? storedSnapshot : null;
  const snapshot = matchingStoredSnapshot ?? liveSnapshot;

  if (!snapshot) {
    return null;
  }

  if (liveSnapshot && !isRestorableArticleViewportSnapshot(liveSnapshot)) {
    return null;
  }

  return snapshot;
}

function startCollapseScrollRestore({
  articleKey,
  clearPreExpandSnapshot,
  collapseScrollRestoreCleanupRef,
  setIsCollapseScrollRestoreActive,
  snapshot,
}: {
  articleKey: string;
  clearPreExpandSnapshot: () => void;
  collapseScrollRestoreCleanupRef: React.RefObject<(() => void) | null>;
  setIsCollapseScrollRestoreActive: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  snapshot: ArticleViewportSnapshot;
}) {
  const runtime = createCollapseScrollRestoreRuntime({
    articleKey,
    clearPreExpandSnapshot,
    setIsCollapseScrollRestoreActive,
    snapshot,
  });

  runtime.syncViewportScroll();

  return () => {
    runtime.release();
    collapseScrollRestoreCleanupRef.current = null;
  };
}

function useArticleCollapseLifecycleState() {
  const collapseRemovalTimeoutsRef = useRef(
    new Map<string, RemovalAnimationTimeoutId>(),
  );
  const collapseScrollRestoreCleanupRef = useRef<(() => void) | null>(null);
  const articleViewportSnapshotRef = useRef<ArticleViewportSnapshot | null>(
    null,
  );
  const [isCollapseScrollRestoreActive, setIsCollapseScrollRestoreActive] =
    useState(false);

  useEffect(() => {
    const removalTimeouts = collapseRemovalTimeoutsRef.current;

    return () => {
      setIsCollapseScrollRestoreActive(false);
      collapseScrollRestoreCleanupRef.current?.();
      collapseScrollRestoreCleanupRef.current = null;
      for (const timeoutId of removalTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      removalTimeouts.clear();
    };
  }, []);

  return {
    articleViewportSnapshotRef,
    collapseRemovalTimeoutsRef,
    collapseScrollRestoreCleanupRef,
    isCollapseScrollRestoreActive,
    setIsCollapseScrollRestoreActive,
  };
}

function useArticleCollapseScrollRestoreState({
  articleViewportSnapshotRef,
  clearPreExpandSnapshot,
  collapseScrollRestoreCleanupRef,
  setIsCollapseScrollRestoreActive,
}: {
  articleViewportSnapshotRef: React.RefObject<ArticleViewportSnapshot | null>;
  clearPreExpandSnapshot: () => void;
  collapseScrollRestoreCleanupRef: React.RefObject<(() => void) | null>;
  setIsCollapseScrollRestoreActive: React.Dispatch<
    React.SetStateAction<boolean>
  >;
}) {
  const cancelCollapseScrollRestore = useCallback(() => {
    collapseScrollRestoreCleanupRef.current?.();
    collapseScrollRestoreCleanupRef.current = null;
    setIsCollapseScrollRestoreActive(false);
  }, [collapseScrollRestoreCleanupRef, setIsCollapseScrollRestoreActive]);

  const restoreCollapseScrollPosition = useCallback(
    (articleKey: string) => {
      const snapshot = resolveCollapseScrollSnapshot(
        articleKey,
        articleViewportSnapshotRef.current,
      );

      if (!snapshot) {
        setIsCollapseScrollRestoreActive(false);
        clearPreExpandSnapshot();
        return;
      }

      cancelCollapseScrollRestore();
      articleViewportSnapshotRef.current = snapshot;
      setIsCollapseScrollRestoreActive(true);
      collapseScrollRestoreCleanupRef.current = startCollapseScrollRestore({
        articleKey,
        clearPreExpandSnapshot,
        collapseScrollRestoreCleanupRef,
        setIsCollapseScrollRestoreActive,
        snapshot,
      });
    },
    [
      articleViewportSnapshotRef,
      cancelCollapseScrollRestore,
      clearPreExpandSnapshot,
      collapseScrollRestoreCleanupRef,
      setIsCollapseScrollRestoreActive,
    ],
  );

  return {
    cancelCollapseScrollRestore,
    restoreCollapseScrollPosition,
  };
}

function useArticleRemovalAnimationState({
  collapseRemovalTimeoutsRef,
  feed,
}: {
  collapseRemovalTimeoutsRef: React.RefObject<
    Map<string, RemovalAnimationTimeoutId>
  >;
  feed: Article[];
}) {
  const [collapsingArticles, setCollapsingArticles] =
    useState<CollapsingArticles>({});

  const clearRemovalAnimation = useCallback(
    (articleKey: string) => {
      const timeoutId = collapseRemovalTimeoutsRef.current.get(articleKey);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        collapseRemovalTimeoutsRef.current.delete(articleKey);
      }

      setCollapsingArticles((currentState) =>
        removeCollapsingArticle(currentState, articleKey),
      );
    },
    [collapseRemovalTimeoutsRef],
  );

  const startRemovalAnimation = useCallback(
    (article: Article, mode: ArticleRemovalAnimationMode) => {
      const articleKey = getArticleKey(article);
      const index = feed.findIndex(
        (candidate) => getArticleKey(candidate) === articleKey,
      );

      if (index < 0) {
        return;
      }

      const timeoutId = collapseRemovalTimeoutsRef.current.get(articleKey);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      setCollapsingArticles((currentState) => ({
        ...currentState,
        [articleKey]: { article, index, mode },
      }));
      collapseRemovalTimeoutsRef.current.set(
        articleKey,
        window.setTimeout(() => {
          collapseRemovalTimeoutsRef.current.delete(articleKey);
          setCollapsingArticles((currentState) =>
            removeCollapsingArticle(currentState, articleKey),
          );
        }, getArticleRemovalAnimationDuration(mode)),
      );
    },
    [collapseRemovalTimeoutsRef, feed],
  );

  return {
    clearRemovalAnimation,
    collapsingArticles,
    startRemovalAnimation,
  };
}

function useArticleViewportSnapshotState(
  articleViewportSnapshotRef: React.RefObject<ArticleViewportSnapshot | null>,
) {
  const clearPreExpandSnapshot = useCallback(() => {
    articleViewportSnapshotRef.current = null;
  }, [articleViewportSnapshotRef]);

  const getPreExpandViewportSnapshot = useCallback(
    (articleKey: string) => {
      return articleViewportSnapshotRef.current?.articleKey === articleKey
        ? articleViewportSnapshotRef.current
        : null;
    },
    [articleViewportSnapshotRef],
  );

  const capturePreExpandSnapshot = useCallback(
    (article: Article) => {
      const articleKey = getArticleKey(article);
      const snapshot = captureArticleViewportSnapshot(articleKey);

      articleViewportSnapshotRef.current = snapshot;
      snapshot?.viewport.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.ARTICLE_EXPAND_PREPARED, {
          detail: { articleKey },
        }),
      );
    },
    [articleViewportSnapshotRef],
  );

  return {
    capturePreExpandSnapshot,
    clearPreExpandSnapshot,
    getPreExpandViewportSnapshot,
  };
}
