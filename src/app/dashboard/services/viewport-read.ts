import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/services/article-collection";

const FEED_VIEWPORT_SELECTOR = "[data-radix-scroll-area-viewport]";
const VIEWPORT_ARTICLE_SELECTOR = "article[data-article-key]";

/**
 * Process the collect fully visible unread articles.
 * @param feed - The feed.
 * @param viewport - The viewport.
 * @returns The collect fully visible unread articles.
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
    (article) =>
      !article.isRead && visibleArticleKeys.has(getArticleKey(article)),
  );
}

/**
 * Process the collect fully visible article keys.
 * @param viewport - The viewport.
 * @returns The collect fully visible article keys.
 */
function collectFullyVisibleArticleKeys(viewport: HTMLElement) {
  const viewportRect = viewport.getBoundingClientRect();

  return Array.from(
    viewport.querySelectorAll<HTMLElement>(VIEWPORT_ARTICLE_SELECTOR),
  )
    .filter((articleElement) => {
      // Exclude articles whose entrance animation is still running.
      if (articleElement.closest('[data-article-entering="true"]') !== null) {
        return false;
      }

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
 * Process the find dashboard feed viewport.
 * @param root - The root.
 * @returns The find dashboard feed viewport.
 */
function findDashboardFeedViewport(root: ParentNode = document) {
  const viewports = root.querySelectorAll<HTMLElement>(FEED_VIEWPORT_SELECTOR);

  return (
    Array.from(viewports)
      .filter((viewport) => {
        const viewportRect = viewport.getBoundingClientRect();

        return (
          viewport.isConnected &&
          viewport.querySelector(VIEWPORT_ARTICLE_SELECTOR) !== null &&
          viewportRect.width > 0 &&
          viewportRect.height > 0 &&
          window.getComputedStyle(viewport).visibility !== "hidden"
        );
      })
      .sort((leftViewport, rightViewport) => {
        const rightArticleCount = rightViewport.querySelectorAll(
          VIEWPORT_ARTICLE_SELECTOR,
        ).length;
        const leftArticleCount = leftViewport.querySelectorAll(
          VIEWPORT_ARTICLE_SELECTOR,
        ).length;

        if (rightArticleCount !== leftArticleCount) {
          return rightArticleCount - leftArticleCount;
        }

        return rightViewport.scrollHeight - leftViewport.scrollHeight;
      })[0] ?? null
  );
}
