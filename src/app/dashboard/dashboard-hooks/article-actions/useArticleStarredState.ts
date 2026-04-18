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
 * Manage the article starred state.
 * @param options - The options used to manage the article starred state.
 * @returns The article starred state state and callbacks.
 */
export function useArticleStarredState(options: UseArticleStarredStateOptions) {
  const { articleFilter, mutationTracker, setFeed, usePlaceholderData } =
    options;
  /** Toggles the article's starred state with optimistic UI and rollback. */
  const handleToggleStarredState = useCallback(
    async (article: Article) => {
      const nextStarredState = !article.isStarred;

      await runOptimisticArticleStatusMutation({
        /**
         * Process the apply optimistic update.
         * @param currentFeed - The current feed.
         * @param _articleMap - The article map.
         * @returns The apply optimistic update.
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
         * Process the on error.
         */
        onError: () => {
          toast.error("Unable to update starred state right now.");
        },
        /**
         * Process the restore update.
         * @param currentFeed - The current feed.
         * @param articleMap - The article map.
         * @param failedArticleKeys - The failed article keys.
         * @returns The restore update.
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
         * Process the status patch for article.
         * @returns The status patch for article.
         */
        statusPatchForArticle: () => ({ isStarred: nextStarredState }),
        usePlaceholderData,
      });
    },
    [articleFilter, mutationTracker, setFeed, usePlaceholderData],
  );

  return { handleToggleStarredState };
}
