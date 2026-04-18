import type { Article } from "@/lib/core";

import { type FeedScrollMode } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core/scroll-mode";
import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";

export interface FeedVirtualListEntry {
  article?: Article;
  key: string;
  kind: "article" | "boundary";
}

interface ViewportIncrease {
  bottom: number;
  top: number;
}

const STANDARD_VIEWPORT_INCREASE = { bottom: 600, top: 240 };
const INVERTED_VIEWPORT_INCREASE = { bottom: 240, top: 240 };
const INTERACTIVE_INVERTED_VIEWPORT_INCREASE = {
  bottom: 10_000,
  top: 10_000,
};
const STANDARD_MINIMUM_OVERSCAN_COUNT = 5;
const INVERTED_MINIMUM_OVERSCAN_COUNT = 4;

/**
 * Build the feed virtual list entries.
 * @param articles - The articles.
 * @param feedViewKey - The feed view key.
 * @param scrollMode - The scroll mode.
 * @param showLoadMoreBoundary - The show load more boundary.
 * @returns The feed virtual list entries.
 */
export function buildFeedVirtualListEntries(
  articles: Article[],
  feedViewKey: string,
  scrollMode: FeedScrollMode,
  showLoadMoreBoundary: boolean,
): FeedVirtualListEntry[] {
  const articleEntries = articles.map((article) => ({
    article,
    key: getArticleKey(article),
    kind: "article" as const,
  }));

  if (!showLoadMoreBoundary) {
    return articleEntries;
  }

  const boundaryEntry: FeedVirtualListEntry = {
    key: `${feedViewKey}:load-more-boundary`,
    kind: "boundary",
  };

  return scrollMode === "inverted"
    ? [boundaryEntry, ...articleEntries]
    : [...articleEntries, boundaryEntry];
}

/**
 * Resolve the feed virtual list overscan count.
 * @param estimatedItemHeight - The estimated item height value.
 * @param scrollMode - The scroll mode.
 * @param expandedArticleKey - The expanded article key.
 * @param isCollapseScrollRestoreActive - Whether is collapse scroll restore active.
 * @returns The feed virtual list overscan count.
 */
export function resolveFeedVirtualListOverscanCount(
  estimatedItemHeight: number,
  scrollMode: FeedScrollMode,
  expandedArticleKey: null | string,
  isCollapseScrollRestoreActive: boolean,
) {
  const viewportIncrease = resolveViewportIncrease(
    scrollMode,
    expandedArticleKey,
    isCollapseScrollRestoreActive,
  );
  const effectiveEstimate = Math.max(1, estimatedItemHeight);
  const minimumOverscanCount =
    scrollMode === "standard"
      ? STANDARD_MINIMUM_OVERSCAN_COUNT
      : INVERTED_MINIMUM_OVERSCAN_COUNT;

  return Math.max(
    minimumOverscanCount,
    Math.ceil(
      Math.max(viewportIncrease.bottom, viewportIncrease.top) /
        effectiveEstimate,
    ),
  );
}

/**
 * Resolve the viewport increase.
 * @param scrollMode - The scroll mode.
 * @param expandedArticleKey - The expanded article key.
 * @param isCollapseScrollRestoreActive - Whether is collapse scroll restore active.
 * @returns The viewport increase.
 */
function resolveViewportIncrease(
  scrollMode: FeedScrollMode,
  expandedArticleKey: null | string,
  isCollapseScrollRestoreActive: boolean,
): ViewportIncrease {
  if (scrollMode !== "inverted") {
    return STANDARD_VIEWPORT_INCREASE;
  }

  return expandedArticleKey !== null || isCollapseScrollRestoreActive
    ? INTERACTIVE_INVERTED_VIEWPORT_INCREASE
    : INVERTED_VIEWPORT_INCREASE;
}
