"use client";

import { useCallback, useMemo } from "react";

import { type Article, type CategoryTreeNode } from "@/lib";

import { useArticleStarredState } from "./article-actions/useArticleStarredState";
import { useExpandedArticleCollapse } from "./article-actions/useExpandedArticleCollapse";
import { useExpandedArticleHydration } from "./article-actions/useExpandedArticleHydration";
import { useArticleCollapseState } from "./useArticleCollapseState";
import {
  type FeedExtractionSettings,
  useArticleHydration,
} from "./useArticleHydration";
import { useArticleReadState } from "./useArticleReadState";

interface UseArticleActionsOptions {
  articleFilter: "all" | "read" | "starred" | "unread";
  categories?: CategoryTreeNode[];
  distillStrategy?: string;
  expandedArticleKey: null | string;
  feed: Article[];
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<null | string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  usePlaceholderData?: boolean;
}

/**
 * Coordinates article expansion, hydration, read-state, and star-state updates.
 *
 * Each lifecycle now lives in its owning helper so this hook can expose the
 * stable article-action contract consumed by the dashboard controller.
 */
export function useArticleActions({
  articleFilter,
  categories,
  distillStrategy,
  expandedArticleKey,
  feed,
  setExpandedArticleKey,
  setFeed,
  usePlaceholderData = false,
}: UseArticleActionsOptions) {
  const {
    handleToggleReadState: toggleArticleReadState,
    setArticleReadState,
    setArticlesReadState,
    setUpdatingArticleState,
    updatingArticleState,
  } = useArticleReadState({ setFeed, usePlaceholderData });

  /** Builds a feedUrl-to-settings lookup from the current category tree. */
  const getFeedSettings = useMemo(() => {
    const settingsByFeedUrl = new Map<string, FeedExtractionSettings>();

    for (const category of categories ?? []) {
      for (const child of category.children ?? []) {
        if (child.data?.url) {
          settingsByFeedUrl.set(child.data.url, {
            extractionDisabled: child.data.extractionDisabled,
            proxyEnabled: child.data.proxyEnabled,
          });
        }
      }
    }

    return (feedUrl: string) => settingsByFeedUrl.get(feedUrl);
  }, [categories]);

  const {
    cancelHydration,
    hydrateArticleContent,
    hydratedArticleLinks,
    hydratingArticleLinks,
  } = useArticleHydration({ distillStrategy, getFeedSettings, setFeed });

  const {
    cancelCollapseScrollRestore,
    capturePreExpandSnapshot,
    clearRemovalAnimation,
    collapsingArticles,
    getPreExpandViewportSnapshot,
    isCollapseScrollRestoreActive,
    restoreCollapseScrollPosition,
    startRemovalAnimation,
  } = useArticleCollapseState({ feed });

  const {
    clearExpandedArticleHydrationTracking,
    markExpandedArticleHydrationHandled,
  } = useExpandedArticleHydration({
    distillStrategy,
    expandedArticleKey,
    feed,
    getFeedSettings,
    hydrateArticleContent,
    hydratedArticleLinks,
    hydratingArticleLinks,
  });

  const {
    handleArticleToggle: toggleExpandedArticle,
    handleExpandedSwipeRead,
  } = useExpandedArticleCollapse({
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
  });

  const { handleToggleStarredState } = useArticleStarredState({
    articleFilter,
    setFeed,
    setUpdatingArticleState,
    usePlaceholderData,
  });

  /** Bridges the extracted expansion lifecycle back to the public dashboard callback. */
  const handleArticleToggle = useCallback(async (article: Article) => {
    await toggleExpandedArticle(article, markExpandedArticleHydrationHandled);
  }, [markExpandedArticleHydrationHandled, toggleExpandedArticle]);

  /** Applies swipe-driven read toggles immediately without staging a row exit. */
  const handleSwipeRead = useCallback(async (article: Article) => {
    if (articleFilter === "unread" && !article.isRead) {
      startRemovalAnimation(article, "swipe-read");
    }

    await toggleArticleReadState(article);
  }, [articleFilter, startRemovalAnimation, toggleArticleReadState]);

  /** Applies direct read toggles and stages unread-filter removals for exit motion. */
  const handleToggleReadState = useCallback(async (article: Article) => {
    const nextReadState = !article.isRead;

    if (articleFilter === "unread" && nextReadState) {
      startRemovalAnimation(article, "collapse");
    }

    await toggleArticleReadState(article);
  }, [articleFilter, startRemovalAnimation, toggleArticleReadState]);

  /** Batches read-state updates while preserving unread-removal animations. */
  const handleMarkArticlesRead = useCallback(async (articles: Article[]) => {
    const unreadArticles = articles.filter((article) => !article.isRead);

    if (unreadArticles.length === 0) {
      return;
    }

    if (articleFilter === "unread") {
      for (const article of unreadArticles) {
        startRemovalAnimation(article, "collapse");
      }
    }

    await setArticlesReadState(unreadArticles, true, {
      suppressErrorToast: true,
    });
  }, [articleFilter, setArticlesReadState, startRemovalAnimation]);

  return {
    capturePreExpandSnapshot,
    collapsingArticles,
    getPreExpandViewportSnapshot,
    handleArticleToggle,
    handleExpandedSwipeRead,
    handleMarkArticlesRead,
    handleSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
    hydratedArticleLinks,
    hydratingArticleLinks,
    isCollapseScrollRestoreActive,
    setArticleReadState,
    updatingArticleState,
  };
}