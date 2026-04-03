import { type Dispatch, type SetStateAction, useCallback } from "react";

import { type Article } from "@/lib";

import { getArticleKey } from "../../services/article-collection";
import { type ArticleRemovalAnimationMode } from "../useArticleCollapseState";

interface UseExpandedArticleCollapseOptions {
  articleFilter: "all" | "read" | "starred" | "unread";
  cancelCollapseScrollRestore: () => void;
  cancelHydration: (articleLink: string) => void;
  clearExpandedArticleHydrationTracking: () => void;
  clearRemovalAnimation: (articleKey: string) => void;
  expandedArticleKey: null | string;
  hydrateArticleContent: (article: Article) => Promise<void>;
  restoreCollapseScrollPosition: (articleKey: string) => void;
  setArticleReadState: (
    article: Article,
    nextReadState: boolean,
    options?: { suppressErrorToast?: boolean },
  ) => Promise<boolean>;
  setExpandedArticleKey: Dispatch<SetStateAction<null | string>>;
  startRemovalAnimation: (
    article: Article,
    mode: ArticleRemovalAnimationMode,
  ) => void;
  updatingArticleState: Record<string, boolean>;
}

/**
 * Coordinates expanded-row collapse and expansion transitions.
 *
 * This keeps the expanded-row lifecycle together so the top-level article
 * actions hook can compose read-state, hydration, and star-state mutations
 * without carrying the expansion orchestration inline.
 */
export function useExpandedArticleCollapse({
  articleFilter,
  cancelCollapseScrollRestore,
  cancelHydration,
  clearExpandedArticleHydrationTracking,
  clearRemovalAnimation,
  expandedArticleKey,
  hydrateArticleContent,
  restoreCollapseScrollPosition,
  setArticleReadState,
  setExpandedArticleKey,
  startRemovalAnimation,
  updatingArticleState,
}: UseExpandedArticleCollapseOptions) {
  /** Collapses the current row while preserving the relevant removal animation. */
  const collapseExpandedArticle = useCallback(
    (
      article: Article,
      options?: {
        animationMode?: ArticleRemovalAnimationMode;
        treatAsRead?: boolean;
      },
    ) => {
      const articleKey = getArticleKey(article);

      if (options?.treatAsRead && articleFilter === "unread") {
        startRemovalAnimation(
          article,
          options.animationMode ?? "de-expanding",
        );
      } else {
        clearRemovalAnimation(articleKey);
      }

      restoreCollapseScrollPosition(articleKey);

      setExpandedArticleKey((current) =>
        current === articleKey ? null : current,
      );
      clearExpandedArticleHydrationTracking();

      const link = article.link.trim();
      if (link) {
        cancelHydration(link);
      }
    },
    [
      articleFilter,
      cancelHydration,
      clearExpandedArticleHydrationTracking,
      clearRemovalAnimation,
      restoreCollapseScrollPosition,
      setExpandedArticleKey,
      startRemovalAnimation,
    ],
  );

  /** Expands or collapses an article while keeping hydration and read state aligned. */
  const handleArticleToggle = useCallback(
    async (
      article: Article,
      markExpandedArticleHydrationHandled: (articleKey: string) => void,
    ) => {
      const nextArticleKey = getArticleKey(article);
      const isCollapsing = expandedArticleKey === nextArticleKey;

      if (isCollapsing) {
        collapseExpandedArticle(article, {
          treatAsRead: articleFilter === "unread",
        });
        return;
      }

      clearRemovalAnimation(nextArticleKey);
      cancelCollapseScrollRestore();

      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : nextArticleKey,
      );

      if (!article.isRead && !updatingArticleState[nextArticleKey]) {
        await setArticleReadState(article, true, { suppressErrorToast: true });
      }

      markExpandedArticleHydrationHandled(nextArticleKey);
      await hydrateArticleContent(article);
    },
    [
      articleFilter,
      cancelCollapseScrollRestore,
      clearRemovalAnimation,
      collapseExpandedArticle,
      expandedArticleKey,
      hydrateArticleContent,
      setArticleReadState,
      setExpandedArticleKey,
      updatingArticleState,
    ],
  );

  /** Marks an expanded article read and collapses it through the swipe-removal path. */
  const handleExpandedSwipeRead = useCallback(
    async (article: Article) => {
      const articleKey = getArticleKey(article);

      if (!article.isRead && !updatingArticleState[articleKey]) {
        await setArticleReadState(article, true, { suppressErrorToast: true });
      }

      collapseExpandedArticle(article, {
        animationMode: "swipe-read",
        treatAsRead: true,
      });
    },
    [collapseExpandedArticle, setArticleReadState, updatingArticleState],
  );

  return {
    collapseExpandedArticle,
    handleArticleToggle,
    handleExpandedSwipeRead,
  };
}