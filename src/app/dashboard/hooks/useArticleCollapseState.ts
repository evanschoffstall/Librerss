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
const ARTICLE_SCROLL_RESTORE_BUFFER_MS = 900;

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
  const preExpandArticleKeyRef = useRef<null | string>(null);
  const preExpandScrollTopRef = useRef<null | number>(null);
  const preExpandViewportRef = useRef<HTMLElement | null>(null);
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
    preExpandArticleKeyRef.current = null;
    preExpandScrollTopRef.current = null;
    preExpandViewportRef.current = null;
  }, []);

  const cancelCollapseScrollRestore = useCallback(() => {
    collapseScrollRestoreCleanupRef.current?.();
    collapseScrollRestoreCleanupRef.current = null;
    setIsCollapseScrollRestoreActive(false);
  }, []);

  const capturePreExpandSnapshot = useCallback((article: Article) => {
    const articleKey = getArticleKey(article);
    const articleElement = document.querySelector<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    );
    const viewport =
      articleElement?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      null;

    if (!articleElement || !viewport) {
      return;
    }

    preExpandArticleKeyRef.current = articleKey;
    preExpandScrollTopRef.current = viewport.scrollTop;
    preExpandViewportRef.current = viewport;
  }, []);

  const restoreCollapseScrollPosition = useCallback(
    (articleKey: string) => {
      const targetScrollTop =
        preExpandArticleKeyRef.current === articleKey
          ? preExpandScrollTopRef.current
          : null;
      const viewport =
        preExpandArticleKeyRef.current === articleKey
          ? preExpandViewportRef.current
          : null;

      if (targetScrollTop === null || !viewport) {
        setIsCollapseScrollRestoreActive(false);
        clearPreExpandSnapshot();
        return;
      }

      cancelCollapseScrollRestore();
      setIsCollapseScrollRestoreActive(true);

      const releaseAt =
        performance.now() +
        ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS +
        ARTICLE_SCROLL_RESTORE_BUFFER_MS;
      let animationFrameId = 0;

      const syncViewportScroll = () => {
        viewport.scrollTop = targetScrollTop;

        if (performance.now() >= releaseAt) {
          viewport.scrollTop = targetScrollTop;
          setIsCollapseScrollRestoreActive(false);
          clearPreExpandSnapshot();
          collapseScrollRestoreCleanupRef.current = null;
          return;
        }

        animationFrameId = window.requestAnimationFrame(syncViewportScroll);
      };

      syncViewportScroll();

      collapseScrollRestoreCleanupRef.current = () => {
        if (animationFrameId !== 0) {
          window.cancelAnimationFrame(animationFrameId);
        }
        setIsCollapseScrollRestoreActive(false);
      };
    },
    [cancelCollapseScrollRestore, clearPreExpandSnapshot],
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