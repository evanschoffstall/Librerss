import { type Article } from "@/lib";

import { getArticleKey } from "../../../services/article-collection";
import { type FeedScrollMode } from "./feed-scroll-mode";

export interface FeedVirtualListEntry {
  article?: Article;
  key: string;
  kind: "article" | "boundary";
}

interface ViewportIncrease {
  bottom: number;
  top: number;
}

const STANDARD_VIEWPORT_INCREASE = { bottom: 1500, top: 600 };
const INVERTED_VIEWPORT_INCREASE = { bottom: 600, top: 1500 };
const INTERACTIVE_INVERTED_VIEWPORT_INCREASE = {
  bottom: 10_000,
  top: 10_000,
};

/** Builds the virtual entry list for the current scroll mode. */
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

/** Converts the existing viewport padding contract into a TanStack overscan row count. */
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

  return Math.max(
    8,
    Math.ceil(Math.max(viewportIncrease.bottom, viewportIncrease.top) / effectiveEstimate),
  );
}

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