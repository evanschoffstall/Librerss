"use client";

import { ArticleService, type Article } from "@/lib";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getArticleKey } from "../services/article-collection";

interface UseArticleReadStateOptions {
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
}

export function useArticleReadState({ setFeed }: UseArticleReadStateOptions) {
  const [updatingArticleState, setUpdatingArticleState] = useState<
    Record<string, boolean>
  >({});

  const setArticleReadState = useCallback(
    async (
      article: Article,
      nextReadState: boolean,
      options?: { suppressErrorToast?: boolean },
    ) => {
      const articleKey = getArticleKey(article);

      setUpdatingArticleState((current) => ({
        ...current,
        [articleKey]: true,
      }));
      setFeed((currentFeed) =>
        currentFeed.map((a) =>
          getArticleKey(a) === articleKey ? { ...a, isRead: nextReadState } : a,
        ),
      );
      await Promise.resolve();

      try {
        await ArticleService.updateArticleStatus(article.id, {
          isRead: nextReadState,
        });
      } catch (error) {
        console.error("Set read state error:", error);
        setFeed((currentFeed) =>
          currentFeed.map((a) =>
            getArticleKey(a) === articleKey
              ? { ...a, isRead: article.isRead }
              : a,
          ),
        );
        if (!options?.suppressErrorToast) {
          toast.error("Unable to update read state right now.");
        }
      } finally {
        setUpdatingArticleState(({ [articleKey]: _, ...rest }) => rest);
      }
    },
    [setFeed],
  );

  const handleToggleReadState = useCallback(
    async (article: Article) => {
      await setArticleReadState(article, !article.isRead);
    },
    [setArticleReadState],
  );

  return {
    updatingArticleState,
    setUpdatingArticleState,
    setArticleReadState,
    handleToggleReadState,
  };
}
