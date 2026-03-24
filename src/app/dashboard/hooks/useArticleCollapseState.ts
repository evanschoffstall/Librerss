"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Article } from "@/lib";

import { getArticleKey } from "../services/article-collection";
import { escapeArticleKey } from "./useArticleHydration";

/**
 * Duration used to keep unread-filter removals mounted while the row exits.
 */
export const ARTICLE_REMOVAL_ANIMATION_MS = 180;
export const ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS = 130;
const ARTICLE_SCROLL_RESTORE_BUFFER_MS = 120;

export type ArticleRemovalAnimationMode =
  | "collapse"
  | "de-expanding"
  | "swipe-read";

export type CollapsingArticles = Partial<Record<string, CollapsingArticleState>>;

export interface CollapsingArticleState {
  article: Article;
  index: number;
  mode: ArticleRemovalAnimationMode;
}

interface ArticleViewportSnapshot {
  articleBottomOffsetTop: number;
  articleKey: string;
  articleViewportOffsetTop: number;
  viewport: HTMLElement;
  viewportScrollTop: number;
}

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
export function useArticleCollapseState({ feed }: UseArticleCollapseStateOptions) {
  const collapseRemovalTimeoutsRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const collapseScrollRestoreCleanupRef = useRef<(() => void) | null>(null);
  const articleViewportSnapshotRef = useRef<ArticleViewportSnapshot | null>(null);
  const [isCollapseScrollRestoreActive, setIsCollapseScrollRestoreActive] =
    useState(false);
  const [collapsingArticles, setCollapsingArticles] =
    useState<CollapsingArticles>({});

  useEffect(() => {
    const removalTimeouts = collapseRemovalTimeoutsRef.current;

    return () => {
      setIsCollapseScrollRestoreActive(false);
      collapseScrollRestoreCleanupRef.current?.();
      collapseScrollRestoreCleanupRef.current = null;
      for (const timeoutId of removalTimeouts.values()) {
        clearTimeout(timeoutId);
      }
      removalTimeouts.clear();
    };
  }, []);

  const clearPreExpandSnapshot = useCallback(() => {
    articleViewportSnapshotRef.current = null;
  }, []);

  const cancelCollapseScrollRestore = useCallback(() => {
    collapseScrollRestoreCleanupRef.current?.();
    collapseScrollRestoreCleanupRef.current = null;
    setIsCollapseScrollRestoreActive(false);
  }, []);

  const captureArticleViewportSnapshot = useCallback((articleKey: string) => {
    const articleElement = document.querySelector<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    );
    const viewport =
      articleElement?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      null;

    if (!articleElement || !viewport) {
      return null;
    }

    return {
      articleBottomOffsetTop: getViewportOffsetTop(articleElement, viewport) +
        articleElement.getBoundingClientRect().height,
      articleKey,
      articleViewportOffsetTop: getViewportOffsetTop(articleElement, viewport),
      viewport,
      viewportScrollTop: viewport.scrollTop,
    } satisfies ArticleViewportSnapshot;
  }, []);

  const capturePreExpandSnapshot = useCallback((article: Article) => {
    const articleKey = getArticleKey(article);
    articleViewportSnapshotRef.current = captureArticleViewportSnapshot(articleKey);
  }, [captureArticleViewportSnapshot]);

  const restoreCollapseScrollPosition = useCallback(
    (articleKey: string) => {
      const liveSnapshot = captureArticleViewportSnapshot(articleKey);
      const storedSnapshot = articleViewportSnapshotRef.current?.articleKey === articleKey
        ? articleViewportSnapshotRef.current
        : null;
      const snapshot = storedSnapshot ?? liveSnapshot;

      if (!snapshot) {
        setIsCollapseScrollRestoreActive(false);
        clearPreExpandSnapshot();
        return;
      }

      if (liveSnapshot && !isRestorableArticleViewportSnapshot(liveSnapshot)) {
        setIsCollapseScrollRestoreActive(false);
        clearPreExpandSnapshot();
        return;
      }

      cancelCollapseScrollRestore();
      articleViewportSnapshotRef.current = snapshot;
      setIsCollapseScrollRestoreActive(true);

      const { viewport, viewportScrollTop } = snapshot;
      const releaseAt =
        performance.now() +
        ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS +
        ARTICLE_SCROLL_RESTORE_BUFFER_MS;
      let animationFrameId = 0;
      const previousOverflowAnchor = viewport.style.overflowAnchor;

      viewport.style.overflowAnchor = "none";

      const release = () => {
        if (animationFrameId !== 0) {
          window.cancelAnimationFrame(animationFrameId);
          animationFrameId = 0;
        }
        viewport.removeEventListener("wheel", release);
        viewport.removeEventListener("touchmove", release);
        viewport.style.overflowAnchor = previousOverflowAnchor;
        setIsCollapseScrollRestoreActive(false);
        clearPreExpandSnapshot();
        collapseScrollRestoreCleanupRef.current = null;
      };

      const syncViewportScroll = () => {
        const currentSnapshot = captureArticleViewportSnapshot(articleKey);

        if (currentSnapshot?.viewport !== viewport) {
          release();
          return;
        }

        if (Math.abs(viewport.scrollTop - viewportScrollTop) > 1) {
          viewport.scrollTop = viewportScrollTop;
        }

        if (performance.now() >= releaseAt) {
          release();
          return;
        }

        animationFrameId = window.requestAnimationFrame(syncViewportScroll);
      };

      syncViewportScroll();

      // Stop fighting scroll if the user intentionally scrolls
      viewport.addEventListener("wheel", release, { passive: true });
      viewport.addEventListener("touchmove", release, { passive: true });

      collapseScrollRestoreCleanupRef.current = () => {
        release();
      };
    },
    [
      cancelCollapseScrollRestore,
      captureArticleViewportSnapshot,
      clearPreExpandSnapshot,
    ],
  );

  const clearRemovalAnimation = useCallback((articleKey: string) => {
    const timeoutId = collapseRemovalTimeoutsRef.current.get(articleKey);
    if (timeoutId) {
      clearTimeout(timeoutId);
      collapseRemovalTimeoutsRef.current.delete(articleKey);
    }

    setCollapsingArticles((currentState) =>
      removeCollapsingArticle(currentState, articleKey),
    );
  }, []);

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
        [articleKey]: {
          article,
          index,
          mode,
        },
      }));

      collapseRemovalTimeoutsRef.current.set(
        articleKey,
        setTimeout(() => {
          collapseRemovalTimeoutsRef.current.delete(articleKey);
          setCollapsingArticles((currentState) =>
            removeCollapsingArticle(currentState, articleKey),
          );
        }, getArticleRemovalAnimationDuration(mode)),
      );
    },
    [feed],
  );

  return {
    cancelCollapseScrollRestore,
    capturePreExpandSnapshot,
    clearRemovalAnimation,
    collapsingArticles,
    isCollapseScrollRestoreActive,
    restoreCollapseScrollPosition,
    startRemovalAnimation,
  };
}

function getViewportOffsetTop(element: HTMLElement, viewport: HTMLElement) {
  return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
}

function isRestorableArticleViewportSnapshot(
  snapshot: ArticleViewportSnapshot,
) {
  return snapshot.articleBottomOffsetTop > 0 &&
    snapshot.articleViewportOffsetTop < snapshot.viewport.clientHeight;
}

function removeCollapsingArticle(
  currentState: CollapsingArticles,
  articleKey: string,
) {
  if (!currentState[articleKey]) {
    return currentState;
  }

  const { [articleKey]: _removed, ...rest } = currentState;
  return rest;
}