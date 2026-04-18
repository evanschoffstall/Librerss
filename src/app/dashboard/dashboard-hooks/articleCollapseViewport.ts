"use client";

import { escapeArticleKey } from "@/app/dashboard/dashboard-hooks/useArticleHydration";
import {
  findDashboardFeedViewport,
  getViewportOffsetTop,
  observeFeedViewportLayout,
  resolveFeedViewport,
} from "@/app/dashboard/dashboard-services/feed-data";

export interface ArticleViewportSnapshot {
  articleBottomOffsetTop: number;
  articleHeaderViewportOffsetTop: number;
  articleKey: string;
  articleViewportOffsetTop: number;
  viewport: HTMLElement;
  viewportScrollTop: number;
}

export interface CollapseRestoreLayoutObserverOptions {
  articleKey: string;
  onLayoutChange: () => void;
  viewport: HTMLElement;
}

/**
 * Process the capture article viewport snapshot.
 * @param articleKey - The article key.
 * @returns The capture article viewport snapshot.
 */
export function captureArticleViewportSnapshot(articleKey: string) {
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
    articleBottomOffsetTop:
      getViewportOffsetTop(articleElement, viewport) +
      articleElement.getBoundingClientRect().height,
    articleHeaderViewportOffsetTop: getViewportOffsetTop(
      articleElement.querySelector<HTMLElement>(
        "[data-article-swipe-zone='header']",
      ) ?? articleElement,
      viewport,
    ),
    articleKey,
    articleViewportOffsetTop: getViewportOffsetTop(articleElement, viewport),
    viewport,
    viewportScrollTop: viewport.scrollTop,
  } satisfies ArticleViewportSnapshot;
}

/**
 * Return whether is restorable article viewport snapshot.
 * @param snapshot - The snapshot.
 * @returns Whether is restorable article viewport snapshot.
 */
export function isRestorableArticleViewportSnapshot(
  snapshot: ArticleViewportSnapshot,
) {
  return (
    snapshot.articleBottomOffsetTop > 0 &&
    snapshot.articleViewportOffsetTop < snapshot.viewport.clientHeight
  );
}

/**
 * Process the observe collapse restore layout.
 * @param options - The options used to process the observe collapse restore layout.
 * @returns The observe collapse restore layout.
 */
export function observeCollapseRestoreLayout(
  options: CollapseRestoreLayoutObserverOptions,
) {
  const { articleKey, onLayoutChange, viewport } = options;
  return observeFeedViewportLayout({
    /**
     * Resolves the anchor element used to observe collapse layout changes.
     * @returns The current collapse anchor element for the article.
     */
    findAnchor: () => findCollapseRestoreAnchor(articleKey),
    onLayoutChange,
    viewport,
  });
}

/**
 * Process the remove collapsing article.
 * @param currentState - The current state.
 * @param articleKey - The article key.
 * @returns The remove collapsing article.
 */
export function removeCollapsingArticle<T>(
  currentState: Partial<Record<string, T>>,
  articleKey: string,
) {
  if (!currentState[articleKey]) {
    return currentState;
  }

  const { [articleKey]: _removed, ...rest } = currentState;
  return rest;
}

/**
 * Resolve the collapse restore viewport.
 * @param articleKey - The article key.
 * @param fallbackViewport - The fallback viewport.
 * @returns The collapse restore viewport.
 */
export function resolveCollapseRestoreViewport(
  articleKey: string,
  fallbackViewport: HTMLElement,
) {
  const articleElement = document.querySelector<HTMLElement>(
    `[data-article-key="${escapeArticleKey(articleKey)}"]`,
  );
  const placeholderRow = document.querySelector<HTMLElement>(
    `[data-scroll-restore-key="${escapeArticleKey(articleKey)}"]`,
  );

  return resolveFeedViewport({
    candidateViewports: [
      articleElement?.closest<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ) ?? null,
      placeholderRow?.closest<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ) ?? null,
      findDashboardFeedViewport(),
    ],
    fallbackViewport,
  });
}

/**
 * Process the find collapse restore anchor.
 * @param articleKey - The article key.
 * @returns The find collapse restore anchor.
 */
function findCollapseRestoreAnchor(articleKey: string) {
  return document.querySelector<HTMLElement>(
    `[data-scroll-restore-key="${escapeArticleKey(articleKey)}"], [data-article-key="${escapeArticleKey(articleKey)}"]`,
  );
}
