"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { type Article, ArticleService } from "@/lib";

import { getArticleKey } from "../services/article-collection";

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
  const [updatingArticleState, setUpdatingArticleState] = useState<
    Record<string, boolean>
  >({});

  const setArticlesReadState = useCallback(
    async (
      articles: Article[],
      nextReadState: boolean,
      options?: SetReadStateOptions,
    ) => {
      const articleMap = new Map<string, Article>();

      for (const article of articles) {
        articleMap.set(getArticleKey(article), article);
      }

      if (articleMap.size === 0) {
        return 0;
      }

      const articleKeys = Array.from(articleMap.keys());
      const articleKeySet = new Set(articleKeys);
      const nextUpdatingState = Object.fromEntries(
        articleKeys.map((articleKey) => [articleKey, true]),
      );

      setUpdatingArticleState((current) => ({
        ...current,
        ...nextUpdatingState,
      }));
      setFeed((currentFeed) =>
        currentFeed.map((feedArticle) => {
          const articleKey = getArticleKey(feedArticle);

          return articleMap.has(articleKey)
            ? { ...feedArticle, isRead: nextReadState }
            : feedArticle;
        }),
      );

      try {
        if (usePlaceholderData) {
          return articleMap.size;
        }

        const articleEntries = Array.from(articleMap.entries());
        const results = await Promise.allSettled(
          articleEntries.map(([, article]) =>
            ArticleService.updateArticleStatus(article.id, {
              isRead: nextReadState,
            }),
          ),
        );
        const failedArticleEntries = articleEntries.filter(
          (_entry, index) => results[index]?.status === "rejected",
        );

        if (failedArticleEntries.length > 0) {
          const failedArticleKeys = new Set(
            failedArticleEntries.map(([articleKey]) => articleKey),
          );

          setFeed((currentFeed) =>
            currentFeed.map((feedArticle) => {
              const articleKey = getArticleKey(feedArticle);
              const failedArticle = articleMap.get(articleKey);

              return failedArticleKeys.has(articleKey) && failedArticle
                ? { ...feedArticle, isRead: failedArticle.isRead }
                : feedArticle;
            }),
          );

          if (!options?.suppressErrorToast) {
            toast.error("Unable to update read state right now.");
          }
        }

        return articleMap.size - failedArticleEntries.length;
      } catch (error) {
        console.error("Set read state error:", error);

        setFeed((currentFeed) =>
          currentFeed.map((feedArticle) => {
            const articleKey = getArticleKey(feedArticle);
            const originalArticle = articleMap.get(articleKey);

            return originalArticle
              ? { ...feedArticle, isRead: originalArticle.isRead }
              : feedArticle;
          }),
        );

        if (!options?.suppressErrorToast) {
          toast.error("Unable to update read state right now.");
        }

        return 0;
      } finally {
        setUpdatingArticleState((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([articleKey]) => !articleKeySet.has(articleKey),
            ),
          ),
        );
      }
    },
    [setFeed, usePlaceholderData],
  );

  const setArticleReadState = useCallback(
    async (
      article: Article,
      nextReadState: boolean,
      options?: SetReadStateOptions,
    ) => {
      return (await setArticlesReadState([article], nextReadState, options)) === 1;
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
    handleToggleReadState,
    setArticleReadState,
    setArticlesReadState,
    setUpdatingArticleState,
    updatingArticleState,
  };
}
