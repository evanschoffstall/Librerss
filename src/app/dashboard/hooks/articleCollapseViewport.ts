"use client";

import { selectBestVisibleElement } from "@/app/dashboard/components/feed-view/feed-list-surface-state/view-core";
import { escapeArticleKey } from "@/app/dashboard/hooks/useArticleHydration";
import {
  findDashboardFeedViewport,
  getViewportOffsetTop,
  observeFeedViewportLayout,
  resolveFeedViewport,
} from "@/app/dashboard/services/feed-data";

/**
 * Describes the article viewport snapshot.
 */
export interface ArticleViewportSnapshot {
  articleBottomOffsetTop: number;
  articleHeaderViewportOffsetTop: number;
  articleKey: string;
  articleViewportOffsetTop: number;
  viewport: HTMLElement;
  viewportScrollTop: number;
}

/**
 * Describes the options for collapse restore layout observer.
 */
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
  const viewport = findDashboardFeedViewport();
  const articleElement = selectBestVisibleArticleElement(articleKey, viewport);

  if (articleElement === null && viewport === null) {
    return null;
  }

  const resolvedViewport =
    articleElement === null
      ? viewport
      : (articleElement.closest<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        ) ?? viewport);

  if (articleElement === null || resolvedViewport === null) {
    return null;
  }

  return {
    articleBottomOffsetTop:
      getViewportOffsetTop(articleElement, resolvedViewport) +
      articleElement.getBoundingClientRect().height,
    articleHeaderViewportOffsetTop: getViewportOffsetTop(
      articleElement.querySelector<HTMLElement>(
        "[data-article-swipe-zone='header']",
      ) ?? articleElement,
      resolvedViewport,
    ),
    articleKey,
    articleViewportOffsetTop: getViewportOffsetTop(
      articleElement,
      resolvedViewport,
    ),
    viewport: resolvedViewport,
    viewportScrollTop: resolvedViewport.scrollTop,
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
  const articleElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    ),
  );
  const placeholderRows = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-scroll-restore-key="${escapeArticleKey(articleKey)}"]`,
    ),
  );

  return resolveFeedViewport({
    candidateViewports: [
      ...articleElements.map((articleElement) =>
        articleElement.closest<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        ),
      ),
      ...placeholderRows.map((placeholderRow) =>
        placeholderRow.closest<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        ),
      ),
      findDashboardFeedViewport(),
    ],
    fallbackViewport,
  });
}

/**
 * Restrict DOM candidates to the currently active feed viewport.
 * @param candidates - The candidate article or placeholder elements.
 * @param viewport - The active feed viewport that should own the candidates.
 * @returns The subset of candidates rendered inside the active viewport.
 */
function filterCandidatesToViewport(
  candidates: HTMLElement[],
  viewport: HTMLElement,
) {
  return candidates.filter((candidate) => {
    return (
      candidate.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ===
      viewport
    );
  });
}

/**
 * Process the find collapse restore anchor.
 * @param articleKey - The article key.
 * @returns The find collapse restore anchor.
 */
function findCollapseRestoreAnchor(articleKey: string) {
  const viewport = findDashboardFeedViewport();
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-scroll-restore-key="${escapeArticleKey(articleKey)}"], [data-article-key="${escapeArticleKey(articleKey)}"]`,
    ),
  );

  if (!viewport) {
    return candidates[0] ?? null;
  }

  return selectBestVisibleElement(
    filterCandidatesToViewport(candidates, viewport),
    viewport,
  );
}

/**
 * Select the visible article element that best represents the keyed row.
 * @param articleKey - The stable article key to locate in the DOM.
 * @param viewport - The current feed viewport, when one is available.
 * @returns The best visible article element for the keyed row, if present.
 */
function selectBestVisibleArticleElement(
  articleKey: string,
  viewport: HTMLElement | null,
) {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    ),
  );

  if (!viewport) {
    return candidates[0] ?? null;
  }

  return selectBestVisibleElement(
    filterCandidatesToViewport(candidates, viewport),
    viewport,
  );
}
