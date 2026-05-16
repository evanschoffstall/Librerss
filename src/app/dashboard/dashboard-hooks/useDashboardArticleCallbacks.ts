"use client";

import { useCallback } from "react";

import type { Article } from "@/lib/core";

import {
  type ArticleFilter,
  type ArticleSortOrder,
} from "@/app/dashboard/dashboard-services/article";

/**
 * Describes the options for use dashboard article callbacks.
 */
interface UseDashboardArticleCallbacksOptions {
  articleFilter: ArticleFilter;
  articleSortOrder: ArticleSortOrder;
  capturePreExpandSnapshot: (article: Article) => void;
  handleArticleToggle: (article: Article) => void;
  handleExpandedSwipeRead: (article: Article) => void;
  handleSwipeRead: (article: Article) => Promise<void>;
  handleToggleReadState: (article: Article) => Promise<void>;
  handleToggleStarredState: (article: Article) => Promise<void>;
  selectedCategory: string;
}

/**
 * Manage the dashboard article callbacks.
 * @param options - The options used to manage the dashboard article callbacks.
 * @returns The dashboard article callbacks state and callbacks.
 */
export function useDashboardArticleCallbacks(
  options: UseDashboardArticleCallbacksOptions,
) {
  const {
    articleFilter,
    articleSortOrder,
    capturePreExpandSnapshot,
    handleArticleToggle,
    handleExpandedSwipeRead,
    handleSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
    selectedCategory,
  } = options;
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
    feedViewKey: `${selectedCategory}:${articleFilter}:${articleSortOrder}`,
    onArticleExpandedSwipeRead,
    onArticlePrepareExpand,
    onArticleSwipeRead,
    onArticleToggle,
    onArticleToggleRead,
    onArticleToggleStarred,
  };
}
