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
 * @param articleKey
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
 * @param snapshot
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
 * @param root0
 * @param root0.articleKey
 * @param root0.onLayoutChange
 * @param root0.viewport
 */
export function observeCollapseRestoreLayout({
  articleKey,
  onLayoutChange,
  viewport,
}: CollapseRestoreLayoutObserverOptions) {
  return observeFeedViewportLayout({
    /**
     *
     */
    findAnchor: () => findCollapseRestoreAnchor(articleKey),
    onLayoutChange,
    viewport,
  });
}

/**
 * @param currentState
 * @param articleKey
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
 * @param articleKey
 * @param fallbackViewport
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
 * @param articleKey
 */
function findCollapseRestoreAnchor(articleKey: string) {
  return document.querySelector<HTMLElement>(
    `[data-scroll-restore-key="${escapeArticleKey(articleKey)}"], [data-article-key="${escapeArticleKey(articleKey)}"]`,
  );
}
