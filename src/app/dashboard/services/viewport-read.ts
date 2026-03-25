import { type Article } from "@/lib";

import { getArticleKey } from "./article-collection";

const FEED_VIEWPORT_SELECTOR = "[data-radix-scroll-area-viewport]";
const VIEWPORT_ARTICLE_SELECTOR = "article[data-article-key]";

/**
 * Collects article keys whose rendered card is fully contained inside the feed viewport.
 *
 * Any article clipped by even a single pixel on any edge is excluded so the
 * header action only affects cards that are completely visible to the reader.
 */
export function collectFullyVisibleArticleKeys(viewport: HTMLElement) {
  const viewportRect = viewport.getBoundingClientRect();

  return Array.from(
    viewport.querySelectorAll<HTMLElement>(VIEWPORT_ARTICLE_SELECTOR),
  )
    .filter((articleElement) => {
      const articleRect = articleElement.getBoundingClientRect();

      return (
        articleRect.top >= viewportRect.top &&
        articleRect.right <= viewportRect.right &&
        articleRect.bottom <= viewportRect.bottom &&
        articleRect.left >= viewportRect.left
      );
    })
    .map((articleElement) => articleElement.dataset.articleKey)
    .filter((articleKey): articleKey is string => Boolean(articleKey));
}

/**
 * Resolves unread articles whose cards are completely visible inside the active viewport.
 */
export function collectFullyVisibleUnreadArticles(
  feed: Article[],
  viewport: HTMLElement | null = findDashboardFeedViewport(),
) {
  if (!viewport) {
    return [];
  }

  const visibleArticleKeys = new Set(collectFullyVisibleArticleKeys(viewport));

  return feed.filter(
    (article) => !article.isRead && visibleArticleKeys.has(getArticleKey(article)),
  );
}

/**
 * Returns the active dashboard feed viewport when the article surface is mounted.
 *
 * The dashboard can render several Radix scroll areas at once, so this helper
 * narrows the selection to the viewport that currently owns article cards.
 */
export function findDashboardFeedViewport(root: ParentNode = document) {
  const viewports = root.querySelectorAll<HTMLElement>(FEED_VIEWPORT_SELECTOR);

  return (
    Array.from(viewports).find(
      (viewport) =>
        viewport.isConnected &&
        viewport.querySelector(VIEWPORT_ARTICLE_SELECTOR) !== null,
    ) ?? null
  );
}