import {
  findDashboardFeedViewport,
  isDashboardFeedViewport,
  observeFeedViewportLayout,
  resolveFeedViewport,
} from "../../../services/feed-viewport";
import { type ArticleExpandPreparedDetail, type InvertedExpansionScrollLockObserverOptions, type ShouldAutoAnchorInvertedScrollViewportOptions } from "./types";

interface VisibleArticleHeaderEntry {
  articleKey: string;
  fullyVisible: boolean;
  headerTop: number;
}

/** Returns article keys whose rows are fully visible inside the current viewport. */
export function collectFullyVisibleArticleKeys(viewport: HTMLElement) {
  const viewportRect = viewport.getBoundingClientRect();

  return Array.from(
    viewport.querySelectorAll<HTMLElement>("article[data-article-key]"),
  )
    .filter((articleElement) => {
      const articleRect = articleElement.getBoundingClientRect();

      return (
        articleRect.top >= viewportRect.top &&
        articleRect.bottom <= viewportRect.bottom
      );
    })
    .map((articleElement) => articleElement.dataset.articleKey)
    .filter((articleKey): articleKey is string => Boolean(articleKey));
}

/** Resolves the header element used as the inverted scroll lock anchor. */
export function findInvertedExpansionHeaderAnchor(articleKey: null | string) {
  if (!articleKey) {
    return null;
  }

  return document.querySelector<HTMLElement>(
    `article[data-article-key="${CSS.escape(articleKey)}"] [data-article-swipe-zone='header']`,
  );
}

/** Resolves the lock anchor element for expansion and collapse transitions. */
export function findInvertedExpansionLockAnchor(articleKey: null | string) {
  if (!articleKey) {
    return null;
  }

  return document.querySelector<HTMLElement>(
    `[data-scroll-restore-key="${CSS.escape(articleKey)}"], article[data-article-key="${CSS.escape(articleKey)}"]`,
  );
}

/** Finds the active feed viewport that owns the inverted expansion lock. */
export function findInvertedExpansionLockViewport() {
  return findDashboardFeedViewport();
}

/**
 * Selects the current topmost visible article header for inverted pagination.
 *
 * Prepend pagination must preserve the row the reader is currently aligned to,
 * even when that header is only partially visible at the top edge. Reusing the
 * unread-removal survivor selector here is wrong because that helper prefers a
 * lower fully visible row, which makes pagination snap back to the wrong item.
 */
export function findTopVisibleInvertedPaginationAnchorArticleKey() {
  const viewport = findInvertedExpansionLockViewport();

  if (!viewport) {
    return null;
  }

  const visibleHeaders = collectVisibleArticleHeaderEntries(viewport).sort(
    (left, right) => left.headerTop - right.headerTop,
  );

  return visibleHeaders[0]?.articleKey ?? null;
}

/** Selects the visible survivor article whose header should anchor unread-removal scroll compensation. */
export function findVisibleInvertedRemovalAnchorArticleKey(
  excludedArticleKeys: ReadonlySet<string>,
) {
  const viewport = findInvertedExpansionLockViewport();

  if (!viewport) {
    return null;
  }

  const visibleArticles = collectVisibleArticleHeaderEntries(
    viewport,
    excludedArticleKeys,
  ).sort((left, right) => {
    if (left.fullyVisible !== right.fullyVisible) {
      return left.fullyVisible ? -1 : 1;
    }

    return left.headerTop - right.headerTop;
  });

  return visibleArticles[0]?.articleKey ?? null;
}

/** Measures an element's top offset relative to the owning viewport. */
export function getViewportOffsetTop(
  element: HTMLElement | null,
  viewport: HTMLElement,
) {
  if (!element) {
    return 0;
  }

  return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
}

/** Detects whether a viewport belongs to the feed surface that supports restore anchors. */
export function isInvertedExpansionLockViewport(viewport: HTMLElement) {
  return isDashboardFeedViewport(viewport);
}

/** Watches layout changes that can invalidate an active inverted expansion lock. */
export function observeInvertedExpansionScrollLockLayout({
  articleKey,
  onLayoutChange,
  viewport,
}: InvertedExpansionScrollLockObserverOptions) {
  return observeFeedViewportLayout({
    findAnchor: () =>
      findInvertedExpansionHeaderAnchor(articleKey) ??
      findInvertedExpansionLockAnchor(articleKey),
    onLayoutChange,
    viewport,
  });
}

/** Reads the prepared article key from a dashboard custom event payload. */
export function readPreparedArticleKey(event: Event) {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail = event.detail as ArticleExpandPreparedDetail | null;

  return typeof detail?.articleKey === "string"
    ? detail.articleKey
    : null;
}

/** Re-resolves the viewport after layout migration or Radix viewport replacement. */
export function resolveInvertedExpansionLockViewport(
  articleKey: null | string,
  viewport: HTMLElement,
) {
  return resolveFeedViewport({
    candidateViewports: [
      findInvertedExpansionLockAnchor(articleKey)?.closest<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ) ?? null,
      isInvertedExpansionLockViewport(viewport) ? viewport : null,
      findInvertedExpansionLockViewport(),
    ],
    fallbackViewport: viewport,
  });
}

/** Determines whether inverted mode should keep anchoring the newest visible row. */
export function shouldAutoAnchorInvertedScrollViewport({
  expandedArticleKey,
  hasClaimedInvertedScrollOwnership,
  isInvertedScroll,
  isUnderfilledInvertedViewport,
}: ShouldAutoAnchorInvertedScrollViewportOptions) {
  return (
    isInvertedScroll &&
    expandedArticleKey === null &&
    (
      !hasClaimedInvertedScrollOwnership ||
      isUnderfilledInvertedViewport
    )
  );
}

function collectVisibleArticleHeaderEntries(
  viewport: HTMLElement,
  excludedArticleKeys: ReadonlySet<string> = new Set<string>(),
) {
  const viewportRect = viewport.getBoundingClientRect();

  return Array.from(
    viewport.querySelectorAll<HTMLElement>(
      "article[data-article-key] [data-article-swipe-zone='header']",
    ),
  )
    .map((headerElement) => {
      const articleElement = headerElement.closest<HTMLElement>(
        "article[data-article-key]",
      );
      const articleKey = articleElement?.dataset.articleKey ?? null;

      if (!articleKey || excludedArticleKeys.has(articleKey)) {
        return null;
      }

      const headerRect = headerElement.getBoundingClientRect();

      if (
        headerRect.bottom <= viewportRect.top ||
        headerRect.top >= viewportRect.bottom
      ) {
        return null;
      }

      return {
        articleKey,
        fullyVisible:
          headerRect.top >= viewportRect.top &&
          headerRect.bottom <= viewportRect.bottom,
        headerTop: headerRect.top,
      } satisfies VisibleArticleHeaderEntry;
    })
    .filter((entry): entry is VisibleArticleHeaderEntry => entry !== null);
}