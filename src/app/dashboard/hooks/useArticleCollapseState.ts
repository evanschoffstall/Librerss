"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Article } from "@/lib";

import { DASHBOARD_EVENTS } from "../constants";
import { getArticleKey } from "../services/article-collection";
import { escapeArticleKey } from "./useArticleHydration";

/**
 * Duration used to keep unread-filter removals mounted while the row exits.
 */
export const ARTICLE_REMOVAL_ANIMATION_MS = 180;
export const ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS = 130;
export const ARTICLE_SCROLL_RESTORE_BUFFER_MS = 1200;

export type ArticleRemovalAnimationMode =
  | "collapse"
  | "de-expanding"
  | "swipe-read";

export interface ArticleViewportSnapshot {
  articleBottomOffsetTop: number;
  articleHeaderViewportOffsetTop: number;
  articleKey: string;
  articleViewportOffsetTop: number;
  viewport: HTMLElement;
  viewportScrollTop: number;
}

export type CollapsingArticles = Partial<Record<string, CollapsingArticleState>>;

interface CollapseRestoreLayoutObserverOptions {
  articleKey: string;
  onLayoutChange: () => void;
  viewport: HTMLElement;
}

interface CollapsingArticleState {
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

  const getPreExpandViewportSnapshot = useCallback((articleKey: string) => {
    return articleViewportSnapshotRef.current?.articleKey === articleKey
      ? articleViewportSnapshotRef.current
      : null;
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
      articleHeaderViewportOffsetTop: getViewportOffsetTop(
        articleElement.querySelector<HTMLElement>("[data-article-swipe-zone='header']") ??
          articleElement,
        viewport,
      ),
      articleKey,
      articleViewportOffsetTop: getViewportOffsetTop(articleElement, viewport),
      viewport,
      viewportScrollTop: viewport.scrollTop,
    } satisfies ArticleViewportSnapshot;
  }, []);

  const capturePreExpandSnapshot = useCallback((article: Article) => {
    const articleKey = getArticleKey(article);
    const snapshot = captureArticleViewportSnapshot(articleKey);

    articleViewportSnapshotRef.current = snapshot;
    snapshot?.viewport.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.ARTICLE_EXPAND_PREPARED, {
        detail: { articleKey },
      }),
    );
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
      let disconnectLayoutObservers: (() => void) | null = null;
      let activeViewport = resolveCollapseRestoreViewport(articleKey, viewport) ??
        viewport;
      let activeOverflowAnchor = activeViewport.style.overflowAnchor;

      function scheduleViewportSync() {
        if (animationFrameId !== 0) {
          return;
        }

        animationFrameId = window.requestAnimationFrame(() => {
          animationFrameId = 0;
          syncViewportScroll();
        });
      }

      function reconnectLayoutObservers() {
        disconnectLayoutObservers?.();
        disconnectLayoutObservers = observeCollapseRestoreLayout({
          articleKey,
          onLayoutChange: syncViewportScroll,
          viewport: activeViewport,
        });
      }

      const bindReleaseListeners = (targetViewport: HTMLElement) => {
        targetViewport.addEventListener("wheel", release, { passive: true });
        targetViewport.addEventListener("touchmove", release, { passive: true });
      };

      const unbindReleaseListeners = (targetViewport: HTMLElement) => {
        targetViewport.removeEventListener("wheel", release);
        targetViewport.removeEventListener("touchmove", release);
      };

      const adoptViewport = (nextViewport: HTMLElement) => {
        if (nextViewport === activeViewport) {
          return;
        }

        unbindReleaseListeners(activeViewport);
        activeViewport.style.overflowAnchor = activeOverflowAnchor;
        activeViewport = nextViewport;
        activeOverflowAnchor = activeViewport.style.overflowAnchor;
        activeViewport.style.overflowAnchor = "none";
        bindReleaseListeners(activeViewport);
        reconnectLayoutObservers();
      };

      activeViewport.style.overflowAnchor = "none";

      function release() {
        if (animationFrameId !== 0) {
          window.cancelAnimationFrame(animationFrameId);
          animationFrameId = 0;
        }
        unbindReleaseListeners(activeViewport);
        disconnectLayoutObservers?.();
        disconnectLayoutObservers = null;
        activeViewport.style.overflowAnchor = activeOverflowAnchor;
        setIsCollapseScrollRestoreActive(false);
        clearPreExpandSnapshot();
        collapseScrollRestoreCleanupRef.current = null;
      }

      bindReleaseListeners(activeViewport);
      reconnectLayoutObservers();

      function syncViewportScroll() {
        const currentViewport = resolveCollapseRestoreViewport(articleKey, activeViewport);

        if (!currentViewport) {
          release();
          return;
        }

        adoptViewport(currentViewport);

        if (!activeViewport.isConnected) {
          release();
          return;
        }

        if (Math.abs(activeViewport.scrollTop - viewportScrollTop) > 1) {
          activeViewport.scrollTop = viewportScrollTop;
        }

        if (performance.now() >= releaseAt) {
          release();
          return;
        }

        scheduleViewportSync();
      }

      syncViewportScroll();

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
    getPreExpandViewportSnapshot,
    isCollapseScrollRestoreActive,
    restoreCollapseScrollPosition,
    startRemovalAnimation,
  };
}

function findCollapseRestoreAnchor(articleKey: string) {
  return document.querySelector<HTMLElement>(
    `[data-scroll-restore-key="${escapeArticleKey(articleKey)}"], [data-article-key="${escapeArticleKey(articleKey)}"]`,
  );
}

function findFeedRestoreViewport() {
  const viewports = document.querySelectorAll<HTMLElement>(
    "[data-radix-scroll-area-viewport]",
  );

  return Array.from(viewports).find(isFeedRestoreViewport) ?? null;
}

function getViewportOffsetTop(element: HTMLElement, viewport: HTMLElement) {
  return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
}

function isFeedRestoreViewport(viewport: HTMLElement) {
  return Boolean(
    viewport.querySelector("[data-feed-virtualizer='true'], [data-scroll-restore-key]"),
  );
}

function isRestorableArticleViewportSnapshot(
  snapshot: ArticleViewportSnapshot,
) {
  return snapshot.articleBottomOffsetTop > 0 &&
    snapshot.articleViewportOffsetTop < snapshot.viewport.clientHeight;
}

/**
 * Observes the active restore viewport and its current anchor candidates so the
 * scroll position can be re-applied in the same layout cycle that changes row
 * height or swaps the viewport node.
 */
function observeCollapseRestoreLayout({
  articleKey,
  onLayoutChange,
  viewport,
}: CollapseRestoreLayoutObserverOptions) {
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          onLayoutChange();
        });
  const mutationObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeResizeTargets();
          onLayoutChange();
        });

  const observeResizeTarget = (target: Element | null) => {
    if (!resizeObserver || !target) {
      return;
    }

    resizeObserver.observe(target);
  };

  const observeResizeTargets = () => {
    resizeObserver?.disconnect();
    observeResizeTarget(viewport);
    observeResizeTarget(viewport.firstElementChild);
    observeResizeTarget(findCollapseRestoreAnchor(articleKey));
  };

  observeResizeTargets();
  mutationObserver?.observe(viewport, {
    childList: true,
    subtree: true,
  });

  return () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
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

/** Resolves the feed viewport that should receive collapse scroll restoration. */
function resolveCollapseRestoreViewport(
  articleKey: string,
  fallbackViewport: HTMLElement,
) {
  const articleElement = document.querySelector<HTMLElement>(
    `[data-article-key="${escapeArticleKey(articleKey)}"]`,
  );
  const articleViewport =
    articleElement?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
    null;

  if (articleViewport) {
    return articleViewport;
  }

  const placeholderRow = document.querySelector<HTMLElement>(
    `[data-scroll-restore-key="${escapeArticleKey(articleKey)}"]`,
  );
  const placeholderViewport =
    placeholderRow?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
    null;

  if (placeholderViewport) {
    return placeholderViewport;
  }

  const liveFeedViewport = findFeedRestoreViewport();

  if (liveFeedViewport) {
    return liveFeedViewport;
  }

  return fallbackViewport.isConnected ? fallbackViewport : null;
}