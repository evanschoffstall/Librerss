import { type Dispatch, type SetStateAction, useCallback } from "react";
import { toast } from "sonner";

import type { Article } from "@/lib/core";

import {
  type ArticleMutationTracker,
  runOptimisticArticleStatusMutation,
} from "@/app/dashboard/dashboard-hooks/article-actions/articleStatusMutation";
import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";

interface UseArticleStarredStateOptions {
  articleFilter: "all" | "read" | "starred" | "unread";
  mutationTracker: Pick<
    ArticleMutationTracker,
    "clearUpdatingArticleKeys" | "markUpdatingArticleKeys"
  >;
  setFeed: Dispatch<SetStateAction<Article[]>>;
  usePlaceholderData: boolean;
}

/**
 * Owns optimistic starred-state mutations and rollback behavior.
 *
 * Starred toggles update the visible feed immediately, then either confirm the
 * server mutation or roll back the optimistic change with the correct filter-aware
 * list restoration.
 * @param root0
 * @param root0.articleFilter
 * @param root0.mutationTracker
 * @param root0.setFeed
 * @param root0.usePlaceholderData
 */
export function useArticleStarredState({
  articleFilter,
  mutationTracker,
  setFeed,
  usePlaceholderData,
}: UseArticleStarredStateOptions) {
  /** Toggles the article's starred state with optimistic UI and rollback. */
  const handleToggleStarredState = useCallback(
    async (article: Article) => {
      const nextStarredState = !article.isStarred;

      await runOptimisticArticleStatusMutation({
        /**
         * @param currentFeed
         * @param _articleMap
         */
        applyOptimisticUpdate: (currentFeed, _articleMap) => {
          const articleKey = getArticleKey(article);
          const updated = currentFeed.map((candidate) =>
            getArticleKey(candidate) === articleKey
              ? { ...candidate, isStarred: nextStarredState }
              : candidate,
          );

          if (articleFilter === "starred" && !nextStarredState) {
            return updated.filter(
              (candidate) => getArticleKey(candidate) !== articleKey,
            );
          }

          return updated;
        },
        articles: [article],
        errorLogLabel: "Toggle starred state error",
        mutationTracker,
        /**
         *
         */
        onError: () => {
          toast.error("Unable to update starred state right now.");
        },
        /**
         * @param currentFeed
         * @param articleMap
         * @param failedArticleKeys
         */
        restoreUpdate: (currentFeed, articleMap, failedArticleKeys) => {
          const articleKey = getArticleKey(article);
          const reverted = currentFeed.map((candidate) => {
            const candidateKey = getArticleKey(candidate);
            const shouldRestore =
              !failedArticleKeys || failedArticleKeys.has(candidateKey);

            if (!shouldRestore || candidateKey !== articleKey) {
              return candidate;
            }

            return { ...candidate, isStarred: article.isStarred };
          });

          if (
            (!failedArticleKeys || failedArticleKeys.has(articleKey)) &&
            articleFilter === "starred" &&
            article.isStarred
          ) {
            const alreadyPresent = reverted.some(
              (candidate) => getArticleKey(candidate) === articleKey,
            );

            if (!alreadyPresent) {
              const originalArticle = articleMap.get(articleKey) ?? article;
              return [originalArticle, ...reverted];
            }
          }

          return reverted;
        },
        setFeed,
        /**
         *
         */
        statusPatchForArticle: () => ({ isStarred: nextStarredState }),
        usePlaceholderData,
      });
    },
    [articleFilter, mutationTracker, setFeed, usePlaceholderData],
  );

  return { handleToggleStarredState };
}
