import { type Dispatch, type SetStateAction, useCallback } from "react";

import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { type ArticleRemovalAnimationMode } from "@/app/dashboard/display-types";

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
  const collapseExpandedArticle = useCollapseExpandedArticle({
    articleFilter,
    cancelHydration,
    clearExpandedArticleHydrationTracking,
    clearRemovalAnimation,
    restoreCollapseScrollPosition,
    setExpandedArticleKey,
    startRemovalAnimation,
  });
  const markArticleReadIfNeeded = useMarkExpandedArticleReadIfNeeded({
    setArticleReadState,
    updatingArticleState,
  });
  const handleArticleToggle = useHandleExpandedArticleToggle({
    articleFilter,
    cancelCollapseScrollRestore,
    clearRemovalAnimation,
    collapseExpandedArticle,
    expandedArticleKey,
    hydrateArticleContent,
    markArticleReadIfNeeded,
    setExpandedArticleKey,
  });
  const handleExpandedSwipeRead = useHandleExpandedSwipeRead({
    collapseExpandedArticle,
    markArticleReadIfNeeded,
  });

  return {
    collapseExpandedArticle,
    handleArticleToggle,
    handleExpandedSwipeRead,
  };
}

function useCollapseExpandedArticle({
  articleFilter,
  cancelHydration,
  clearExpandedArticleHydrationTracking,
  clearRemovalAnimation,
  restoreCollapseScrollPosition,
  setExpandedArticleKey,
  startRemovalAnimation,
}: Pick<
  UseExpandedArticleCollapseOptions,
  | "articleFilter"
  | "cancelHydration"
  | "clearExpandedArticleHydrationTracking"
  | "clearRemovalAnimation"
  | "restoreCollapseScrollPosition"
  | "setExpandedArticleKey"
  | "startRemovalAnimation"
>) {
  return useCallback(
    (
      article: Article,
      options?: {
        animationMode?: ArticleRemovalAnimationMode;
        treatAsRead?: boolean;
      },
    ) => {
      const articleKey = getArticleKey(article);
      if (options?.treatAsRead && articleFilter === "unread") {
        startRemovalAnimation(article, options.animationMode ?? "de-expanding");
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
}

function useHandleExpandedArticleToggle({
  articleFilter,
  cancelCollapseScrollRestore,
  clearRemovalAnimation,
  collapseExpandedArticle,
  expandedArticleKey,
  hydrateArticleContent,
  markArticleReadIfNeeded,
  setExpandedArticleKey,
}: {
  articleFilter: UseExpandedArticleCollapseOptions["articleFilter"];
  cancelCollapseScrollRestore: UseExpandedArticleCollapseOptions["cancelCollapseScrollRestore"];
  clearRemovalAnimation: UseExpandedArticleCollapseOptions["clearRemovalAnimation"];
  collapseExpandedArticle: (
    article: Article,
    options?: {
      animationMode?: ArticleRemovalAnimationMode;
      treatAsRead?: boolean;
    },
  ) => void;
  expandedArticleKey: UseExpandedArticleCollapseOptions["expandedArticleKey"];
  hydrateArticleContent: UseExpandedArticleCollapseOptions["hydrateArticleContent"];
  markArticleReadIfNeeded: (article: Article) => Promise<void>;
  setExpandedArticleKey: UseExpandedArticleCollapseOptions["setExpandedArticleKey"];
}) {
  return useCallback(
    async (
      article: Article,
      markExpandedArticleHydrationHandled: (articleKey: string) => void,
    ) => {
      const nextArticleKey = getArticleKey(article);
      if (expandedArticleKey === nextArticleKey) {
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
      await markArticleReadIfNeeded(article);
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
      markArticleReadIfNeeded,
      setExpandedArticleKey,
    ],
  );
}

function useHandleExpandedSwipeRead({
  collapseExpandedArticle,
  markArticleReadIfNeeded,
}: {
  collapseExpandedArticle: (
    article: Article,
    options?: {
      animationMode?: ArticleRemovalAnimationMode;
      treatAsRead?: boolean;
    },
  ) => void;
  markArticleReadIfNeeded: (article: Article) => Promise<void>;
}) {
  return useCallback(
    async (article: Article) => {
      await markArticleReadIfNeeded(article);
      collapseExpandedArticle(article, {
        animationMode: "swipe-read",
        treatAsRead: true,
      });
    },
    [collapseExpandedArticle, markArticleReadIfNeeded],
  );
}

function useMarkExpandedArticleReadIfNeeded({
  setArticleReadState,
  updatingArticleState,
}: Pick<
  UseExpandedArticleCollapseOptions,
  "setArticleReadState" | "updatingArticleState"
>) {
  return useCallback(
    async (article: Article) => {
      const articleKey = getArticleKey(article);
      if (!article.isRead && !updatingArticleState[articleKey]) {
        await setArticleReadState(article, true, { suppressErrorToast: true });
      }
    },
    [setArticleReadState, updatingArticleState],
  );
}
