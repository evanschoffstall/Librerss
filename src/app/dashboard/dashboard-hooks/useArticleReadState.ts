"use client";

import type React from "react";

import { useCallback } from "react";
import { toast } from "sonner";

import type { Article } from "@/lib/core";

import {
  runOptimisticArticleStatusMutation,
  useArticleMutationTracker,
} from "@/app/dashboard/dashboard-hooks/article-actions";
import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";

interface SetReadStateOptions {
  suppressErrorToast?: boolean;
}

interface UseArticleReadStateOptions {
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  usePlaceholderData?: boolean;
}

/**
 * Manage the article read state.
 * @param options - The options used to manage the article read state.
 * @returns The article read state state and callbacks.
 */
export function useArticleReadState(options: UseArticleReadStateOptions) {
  const { setFeed, usePlaceholderData = false } = options;
  const mutationTracker = useArticleMutationTracker();

  const setArticlesReadState = useCallback(
    async (
      articles: Article[],
      nextReadState: boolean,
      options?: SetReadStateOptions,
    ) => {
      const result = await runOptimisticArticleStatusMutation({
        /**
         * Process the apply optimistic update.
         * @param currentFeed - The current feed.
         * @param articleMap - The article map.
         * @returns The apply optimistic update.
         */
        applyOptimisticUpdate: (currentFeed, articleMap) =>
          applyOptimisticReadState(currentFeed, articleMap, nextReadState),
        articles,
        errorLogLabel: "Set read state error",
        mutationTracker,
        /**
         * Process the on error.
         */
        onError: () => {
          showReadStateError(options);
        },
        /**
         * Process the restore update.
         * @param currentFeed - The current feed.
         * @param articleMap - The article map.
         * @param failedArticleKeys - The failed article keys.
         * @returns The restore update.
         */
        restoreUpdate: (currentFeed, articleMap, failedArticleKeys) =>
          restoreArticleReadState(currentFeed, articleMap, failedArticleKeys),
        setFeed,
        /**
         * Process the status patch for article.
         * @returns The status patch for article.
         */
        statusPatchForArticle: () => ({ isRead: nextReadState }),
        usePlaceholderData,
      });

      return result.attemptedCount - result.failedArticleKeys.size;
    },
    [mutationTracker, setFeed, usePlaceholderData],
  );
  const setArticleReadState = useCallback(
    async (
      article: Article,
      nextReadState: boolean,
      options?: SetReadStateOptions,
    ) => {
      return (
        (await setArticlesReadState([article], nextReadState, options)) === 1
      );
    },
    [setArticlesReadState],
  );

  const handleToggleReadState = useCallback(
    async (article: Article) => {
      await setArticleReadState(article, !article.isRead);
    },
    [setArticleReadState],
  );

  return {
    clearUpdatingArticleKeys: mutationTracker.clearUpdatingArticleKeys,
    handleToggleReadState,
    markUpdatingArticleKeys: mutationTracker.markUpdatingArticleKeys,
    mutationTracker,
    setArticleReadState,
    setArticlesReadState,
    updatingArticleState: mutationTracker.updatingArticleState,
  };
}

/**
 * Process the apply optimistic read state.
 * @param currentFeed - The current feed.
 * @param articleMap - The article map.
 * @param nextReadState - The next read state.
 * @returns The apply optimistic read state.
 */
function applyOptimisticReadState(
  currentFeed: Article[],
  articleMap: Map<string, Article>,
  nextReadState: boolean,
) {
  return currentFeed.map((feedArticle) => {
    const articleKey = getArticleKey(feedArticle);
    return articleMap.has(articleKey)
      ? { ...feedArticle, isRead: nextReadState }
      : feedArticle;
  });
}

/**
 * Process the restore article read state.
 * @param currentFeed - The current feed.
 * @param articleMap - The article map.
 * @param failedArticleKeys - The failed article keys.
 * @returns The restore article read state.
 */
function restoreArticleReadState(
  currentFeed: Article[],
  articleMap: Map<string, Article>,
  failedArticleKeys?: Set<string>,
) {
  return currentFeed.map((feedArticle) => {
    const articleKey = getArticleKey(feedArticle);
    const originalArticle = articleMap.get(articleKey);
    const shouldRestore =
      !failedArticleKeys || failedArticleKeys.has(articleKey);
    return shouldRestore && originalArticle
      ? { ...feedArticle, isRead: originalArticle.isRead }
      : feedArticle;
  });
}

/**
 * Process the show read state error.
 * @param options - The options used to process the show read state error.
 */
function showReadStateError(options?: SetReadStateOptions) {
  if (!options?.suppressErrorToast) {
    toast.error("Unable to update read state right now.");
  }
}
