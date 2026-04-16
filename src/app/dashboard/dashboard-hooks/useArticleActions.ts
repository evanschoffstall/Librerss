"use client";

import type React from "react";

import { useCallback, useMemo } from "react";

import type { Article, CategoryTreeNode } from "@/lib/core";

import {
  useArticleStarredState,
  useExpandedArticleCollapse,
  useExpandedArticleHydration,
} from "@/app/dashboard/dashboard-hooks/article-actions";
import { useArticleCollapseState } from "@/app/dashboard/dashboard-hooks/useArticleCollapseState";
import { useArticleHydration } from "@/app/dashboard/dashboard-hooks/useArticleHydration";
import { useArticleReadState } from "@/app/dashboard/dashboard-hooks/useArticleReadState";
import { type FeedExtractionSettings } from "@/app/dashboard/display-types";

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
  return useArticleActionDependencies({
    articleFilter,
    categories,
    distillStrategy,
    expandedArticleKey,
    feed,
    setExpandedArticleKey,
    setFeed,
    usePlaceholderData,
  });
}

function buildArticleActionDependenciesResult(options: {
  actionHandlers: ReturnType<typeof useArticleActionHandlers>;
  expansion: ReturnType<typeof useArticleExpansionDependencies>;
  handleToggleStarredState: ReturnType<
    typeof useArticleStarredState
  >["handleToggleStarredState"];
  readState: ReturnType<typeof useArticleReadState>;
}) {
  return {
    capturePreExpandSnapshot:
      options.expansion.collapseState.capturePreExpandSnapshot,
    collapsingArticles: options.expansion.collapseState.collapsingArticles,
    getPreExpandViewportSnapshot:
      options.expansion.collapseState.getPreExpandViewportSnapshot,
    handleArticleToggle: options.actionHandlers.handleArticleToggle,
    handleExpandedSwipeRead:
      options.expansion.expandedCollapse.handleExpandedSwipeRead,
    handleMarkArticlesRead: options.actionHandlers.handleMarkArticlesRead,
    handleSwipeRead: options.actionHandlers.handleSwipeRead,
    handleToggleReadState: options.actionHandlers.handleToggleReadState,
    handleToggleStarredState: options.handleToggleStarredState,
    hydratedArticleLinks: options.expansion.hydration.hydratedArticleLinks,
    hydratingArticleLinks: options.expansion.hydration.hydratingArticleLinks,
    isCollapseScrollRestoreActive:
      options.expansion.collapseState.isCollapseScrollRestoreActive,
    setArticleReadState: options.readState.setArticleReadState,
    updatingArticleState: options.readState.updatingArticleState,
  };
}

function useArticleActionDependencies({
  articleFilter,
  categories,
  distillStrategy,
  expandedArticleKey,
  feed,
  setExpandedArticleKey,
  setFeed,
  usePlaceholderData = false,
}: UseArticleActionsOptions) {
  const readState = useArticleReadState({ setFeed, usePlaceholderData });
  const getFeedSettings = useFeedSettingsLookup(categories);
  const expansion = useArticleExpansionDependencies({
    articleFilter,
    distillStrategy,
    expandedArticleKey,
    feed,
    getFeedSettings,
    readState,
    setExpandedArticleKey,
    setFeed,
  });
  const handleToggleStarredState = useArticleStarredState({
    articleFilter,
    mutationTracker: readState.mutationTracker,
    setFeed,
    usePlaceholderData,
  }).handleToggleStarredState;
  const actionHandlers = useArticleActionHandlers({
    articleFilter,
    markExpandedArticleHydrationHandled:
      expansion.expandedHydration.markExpandedArticleHydrationHandled,
    setArticlesReadState: readState.setArticlesReadState,
    startRemovalAnimation: expansion.collapseState.startRemovalAnimation,
    toggleArticleReadState: readState.handleToggleReadState,
    toggleExpandedArticle: expansion.expandedCollapse.handleArticleToggle,
  });

  return buildArticleActionDependenciesResult({
    actionHandlers,
    expansion,
    handleToggleStarredState,
    readState,
  });
}

function useArticleActionHandlers({
  articleFilter,
  markExpandedArticleHydrationHandled,
  setArticlesReadState,
  startRemovalAnimation,
  toggleArticleReadState,
  toggleExpandedArticle,
}: {
  articleFilter: UseArticleActionsOptions["articleFilter"];
  markExpandedArticleHydrationHandled: (articleKey: string) => void;
  setArticlesReadState: ReturnType<
    typeof useArticleReadState
  >["setArticlesReadState"];
  startRemovalAnimation: ReturnType<
    typeof useArticleCollapseState
  >["startRemovalAnimation"];
  toggleArticleReadState: ReturnType<
    typeof useArticleReadState
  >["handleToggleReadState"];
  toggleExpandedArticle: (
    article: Article,
    markExpandedArticleHydrationHandled: (articleKey: string) => void,
  ) => Promise<void>;
}) {
  const handleArticleToggle = useCallback(
    async (article: Article) => {
      await toggleExpandedArticle(article, markExpandedArticleHydrationHandled);
    },
    [markExpandedArticleHydrationHandled, toggleExpandedArticle],
  );

  const handleSwipeRead = useCallback(
    async (article: Article) => {
      if (articleFilter === "unread" && !article.isRead) {
        startRemovalAnimation(article, "swipe-read");
      }

      await toggleArticleReadState(article);
    },
    [articleFilter, startRemovalAnimation, toggleArticleReadState],
  );

  const handleToggleReadState = useCallback(
    async (article: Article) => {
      if (articleFilter === "unread" && !article.isRead) {
        startRemovalAnimation(article, "collapse");
      }

      await toggleArticleReadState(article);
    },
    [articleFilter, startRemovalAnimation, toggleArticleReadState],
  );

  const handleMarkArticlesRead = useCallback(
    async (articles: Article[]) => {
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
    },
    [articleFilter, setArticlesReadState, startRemovalAnimation],
  );

  return {
    handleArticleToggle,
    handleMarkArticlesRead,
    handleSwipeRead,
    handleToggleReadState,
  };
}

function useArticleExpansionDependencies({
  articleFilter,
  distillStrategy,
  expandedArticleKey,
  feed,
  getFeedSettings,
  readState,
  setExpandedArticleKey,
  setFeed,
}: {
  articleFilter: UseArticleActionsOptions["articleFilter"];
  distillStrategy: UseArticleActionsOptions["distillStrategy"];
  expandedArticleKey: UseArticleActionsOptions["expandedArticleKey"];
  feed: UseArticleActionsOptions["feed"];
  getFeedSettings: ReturnType<typeof useFeedSettingsLookup>;
  readState: ReturnType<typeof useArticleReadState>;
  setExpandedArticleKey: UseArticleActionsOptions["setExpandedArticleKey"];
  setFeed: UseArticleActionsOptions["setFeed"];
}) {
  const hydration = useArticleHydration({
    distillStrategy,
    getFeedSettings,
    setFeed,
  });
  const collapseState = useArticleCollapseState({ feed });
  const expandedHydration = useExpandedArticleHydration({
    distillStrategy,
    expandedArticleKey,
    feed,
    getFeedSettings,
    hydrateArticleContent: hydration.hydrateArticleContent,
    hydratedArticleLinks: hydration.hydratedArticleLinks,
    hydratingArticleLinks: hydration.hydratingArticleLinks,
  });
  const expandedCollapse = useExpandedArticleCollapse({
    articleFilter,
    cancelCollapseScrollRestore: collapseState.cancelCollapseScrollRestore,
    cancelHydration: hydration.cancelHydration,
    clearExpandedArticleHydrationTracking:
      expandedHydration.clearExpandedArticleHydrationTracking,
    clearRemovalAnimation: collapseState.clearRemovalAnimation,
    expandedArticleKey,
    hydrateArticleContent: hydration.hydrateArticleContent,
    restoreCollapseScrollPosition: collapseState.restoreCollapseScrollPosition,
    setArticleReadState: readState.setArticleReadState,
    setExpandedArticleKey,
    startRemovalAnimation: collapseState.startRemovalAnimation,
    updatingArticleState: readState.updatingArticleState,
  });

  return {
    collapseState,
    expandedCollapse,
    expandedHydration,
    hydration,
  };
}

function useFeedSettingsLookup(categories?: CategoryTreeNode[]) {
  return useMemo(() => {
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
}
