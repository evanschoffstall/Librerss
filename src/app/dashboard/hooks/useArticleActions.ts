"use client";

import type React from "react";

import { useCallback, useMemo } from "react";

import type { Article, CategoryTreeNode } from "@/lib/core";

import { type FeedExtractionSettings } from "@/app/dashboard/display-types";
import {
  useArticleStarredState,
  useArticleStatusMutationController,
  useExpandedArticleCollapse,
  useExpandedArticleHydration,
} from "@/app/dashboard/hooks/article-actions";
import { useArticleCollapseState } from "@/app/dashboard/hooks/useArticleCollapseState";
import { useArticleHydration } from "@/app/dashboard/hooks/useArticleHydration";
import { useArticleReadState } from "@/app/dashboard/hooks/useArticleReadState";

/**
 * Describes the options for article action dependencies result.
 */
interface ArticleActionDependenciesResultOptions {
  actionHandlers: ReturnType<typeof useArticleActionHandlers>;
  expansion: ReturnType<typeof useArticleExpansionDependencies>;
  handleToggleStarredState: ReturnType<
    typeof useArticleStarredState
  >["handleToggleStarredState"];
  readState: ReturnType<typeof useArticleReadState>;
  statusMutationController: ReturnType<
    typeof useArticleStatusMutationController
  >;
}

/**
 * Describes the options for article action handlers.
 */
interface ArticleActionHandlersOptions {
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
}
/**
 * Describes the options for article expansion dependencies.
 */
interface ArticleExpansionDependenciesOptions {
  articleFilter: UseArticleActionsOptions["articleFilter"];
  distillStrategy: UseArticleActionsOptions["distillStrategy"];
  expandedArticleKey: UseArticleActionsOptions["expandedArticleKey"];
  feed: UseArticleActionsOptions["feed"];
  getFeedSettings: ReturnType<typeof useFeedSettingsLookup>;
  readState: ReturnType<typeof useArticleReadState>;
  setExpandedArticleKey: UseArticleActionsOptions["setExpandedArticleKey"];
  setFeed: UseArticleActionsOptions["setFeed"];
}

/**
 * Describes the options for use article actions.
 */
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
 * Manage the article actions.
 * @param options - The options used to manage the article actions.
 * @returns The article actions state and callbacks.
 */
export function useArticleActions(options: UseArticleActionsOptions) {
  const {
    articleFilter,
    categories,
    distillStrategy,
    expandedArticleKey,
    feed,
    setExpandedArticleKey,
    setFeed,
    usePlaceholderData = false,
  } = options;
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
/**
 * Build the article action dependencies result.
 * @param options - The options used to build the article action dependencies result.
 * @returns The article action dependencies result.
 */
function buildArticleActionDependenciesResult(
  options: ArticleActionDependenciesResultOptions,
) {
  return {
    cancelPendingArticleStatusMutations:
      options.statusMutationController.cancelPendingMutations,
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

/**
 * Manage the article action dependencies.
 * @param options - The options used to manage the article action dependencies.
 * @returns The article action dependencies state and callbacks.
 */
function useArticleActionDependencies(options: UseArticleActionsOptions) {
  const {
    articleFilter,
    categories,
    distillStrategy,
    expandedArticleKey,
    feed,
    setExpandedArticleKey,
    setFeed,
    usePlaceholderData = false,
  } = options;
  const statusMutationController = useArticleStatusMutationController();
  const readState = useArticleReadState({
    createMutationSignalHandle:
      statusMutationController.createMutationSignalHandle,
    setFeed,
    usePlaceholderData,
  });
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
    createMutationSignalHandle:
      statusMutationController.createMutationSignalHandle,
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
    statusMutationController,
  });
}
/**
 * Manage the article action handlers.
 * @param options - The options used to manage the article action handlers.
 * @returns The article action handlers state and callbacks.
 */
function useArticleActionHandlers(options: ArticleActionHandlersOptions) {
  const {
    articleFilter,
    markExpandedArticleHydrationHandled,
    setArticlesReadState,
    startRemovalAnimation,
    toggleArticleReadState,
    toggleExpandedArticle,
  } = options;
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

/**
 * Manage the article expansion dependencies.
 * @param options - The options used to manage the article expansion dependencies.
 * @returns The article expansion dependencies state and callbacks.
 */
function useArticleExpansionDependencies(
  options: ArticleExpansionDependenciesOptions,
) {
  const {
    articleFilter,
    distillStrategy,
    expandedArticleKey,
    feed,
    getFeedSettings,
    readState,
    setExpandedArticleKey,
    setFeed,
  } = options;
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

/**
 * Manage the feed settings lookup.
 * @param categories - The categories.
 * @returns The feed settings lookup state and callbacks.
 */
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
