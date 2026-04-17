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

export function useArticleReadState({
  setFeed,
  usePlaceholderData = false,
}: UseArticleReadStateOptions) {
  const mutationTracker = useArticleMutationTracker();

  const setArticlesReadState = useCallback(
    async (
      articles: Article[],
      nextReadState: boolean,
      options?: SetReadStateOptions,
    ) => {
      const result = await runOptimisticArticleStatusMutation({
        applyOptimisticUpdate: (currentFeed, articleMap) =>
          applyOptimisticReadState(currentFeed, articleMap, nextReadState),
        articles,
        errorLogLabel: "Set read state error",
        mutationTracker,
        onError: () => {
          showReadStateError(options);
        },
        restoreUpdate: (currentFeed, articleMap, failedArticleKeys) =>
          restoreArticleReadState(currentFeed, articleMap, failedArticleKeys),
        setFeed,
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

function showReadStateError(options?: SetReadStateOptions) {
  if (!options?.suppressErrorToast) {
    toast.error("Unable to update read state right now.");
  }
}
