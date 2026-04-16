"use client";

import { useCallback } from "react";

import type { Article } from "@/lib/core";

import { type ArticleFilter } from "@/app/dashboard/dashboard-services/article";

interface UseDashboardArticleCallbacksOptions {
  articleFilter: ArticleFilter;
  capturePreExpandSnapshot: (article: Article) => void;
  handleArticleToggle: (article: Article) => void;
  handleExpandedSwipeRead: (article: Article) => void;
  handleSwipeRead: (article: Article) => Promise<void>;
  handleToggleReadState: (article: Article) => Promise<void>;
  handleToggleStarredState: (article: Article) => Promise<void>;
  selectedCategory: string;
}

/**
 * Stabilizes the article-interaction callbacks consumed by the feed surface.
 *
 * Keeping these wrappers in a focused hook trims controller noise while
 * preserving a single place that defines the feed view key contract.
 */
export function useDashboardArticleCallbacks({
  articleFilter,
  capturePreExpandSnapshot,
  handleArticleToggle,
  handleExpandedSwipeRead,
  handleSwipeRead,
  handleToggleReadState,
  handleToggleStarredState,
  selectedCategory,
}: UseDashboardArticleCallbacksOptions) {
  const onArticleToggle = useCallback(
    (article: Article) => {
      handleArticleToggle(article);
    },
    [handleArticleToggle],
  );
  const onArticlePrepareExpand = useCallback(
    (article: Article) => {
      capturePreExpandSnapshot(article);
    },
    [capturePreExpandSnapshot],
  );
  const onArticleToggleRead = useCallback(
    (article: Article) => void handleToggleReadState(article),
    [handleToggleReadState],
  );
  const onArticleExpandedSwipeRead = useCallback(
    (article: Article) => {
      handleExpandedSwipeRead(article);
    },
    [handleExpandedSwipeRead],
  );
  const onArticleSwipeRead = useCallback(
    (article: Article) => {
      void handleSwipeRead(article);
    },
    [handleSwipeRead],
  );
  const onArticleToggleStarred = useCallback(
    (article: Article) => void handleToggleStarredState(article),
    [handleToggleStarredState],
  );

  return {
    feedViewKey: `${selectedCategory}:${articleFilter}`,
    onArticleExpandedSwipeRead,
    onArticlePrepareExpand,
    onArticleSwipeRead,
    onArticleToggle,
    onArticleToggleRead,
    onArticleToggleStarred,
  };
}
