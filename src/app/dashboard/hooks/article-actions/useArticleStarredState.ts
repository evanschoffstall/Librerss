import { type Dispatch, type SetStateAction, useCallback } from "react";
import { toast } from "sonner";

import { type Article, ArticleService } from "@/lib";

import { getArticleKey } from "../../services/article-collection";

interface UseArticleStarredStateOptions {
  articleFilter: "all" | "read" | "starred" | "unread";
  setFeed: Dispatch<SetStateAction<Article[]>>;
  setUpdatingArticleState: Dispatch<SetStateAction<Record<string, boolean>>>;
  usePlaceholderData: boolean;
}

/**
 * Owns optimistic starred-state mutations and rollback behavior.
 *
 * Starred toggles update the visible feed immediately, then either confirm the
 * server mutation or roll back the optimistic change with the correct filter-aware
 * list restoration.
 */
export function useArticleStarredState({
  articleFilter,
  setFeed,
  setUpdatingArticleState,
  usePlaceholderData,
}: UseArticleStarredStateOptions) {
  /** Toggles the article's starred state with optimistic UI and rollback. */
  const handleToggleStarredState = useCallback(
    async (article: Article) => {
      const articleKey = getArticleKey(article);
      const nextStarredState = !article.isStarred;

      setUpdatingArticleState((current) => ({
        ...current,
        [articleKey]: true,
      }));

      setFeed((currentFeed) => {
        const updated = currentFeed.map((candidate) =>
          getArticleKey(candidate) === articleKey
            ? { ...candidate, isStarred: nextStarredState }
            : candidate,
        );

        if (articleFilter === "starred" && !nextStarredState) {
          return updated.filter((candidate) => getArticleKey(candidate) !== articleKey);
        }

        return updated;
      });

      try {
        if (!usePlaceholderData) {
          await ArticleService.updateArticleStatus(article.id, {
            isStarred: nextStarredState,
          });
        }
      } catch (error) {
        console.error("Toggle starred state error:", error);
        setFeed((currentFeed) => {
          const reverted = currentFeed.map((candidate) =>
            getArticleKey(candidate) === articleKey
              ? { ...candidate, isStarred: article.isStarred }
              : candidate,
          );

          if (articleFilter === "starred" && article.isStarred) {
            const alreadyPresent = reverted.some(
              (candidate) => getArticleKey(candidate) === articleKey,
            );

            if (!alreadyPresent) {
              return [article, ...reverted];
            }
          }

          return reverted;
        });
        toast.error("Unable to update starred state right now.");
      } finally {
        setUpdatingArticleState(({ [articleKey]: _ignored, ...rest }) => rest);
      }
    },
    [articleFilter, setFeed, setUpdatingArticleState, usePlaceholderData],
  );

  return { handleToggleStarredState };
}