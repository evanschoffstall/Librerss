"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { getArticleKey } from "../services/article-collection";

import {
  type FeedExtractionSettings,
  useArticleHydration,
} from "./useArticleHydration";
import { useArticleReadState } from "./useArticleReadState";
import { useFeedScrollLock } from "./useFeedSurface";

import { type Article, ArticleService, type CategoryTreeNode } from "@/lib";

const ARTICLE_REMOVAL_ANIMATION_MS = 320;

export const toggleReadStatus = (isRead: boolean) => !isRead;
export const toggleStarredStatus = (isStarred: boolean) => !isStarred;

interface UseArticleActionsOptions {
  articleFilter: "all" | "read" | "starred" | "unread";
  categories?: CategoryTreeNode[];
  distillStrategy?: string;
  expandedArticleKey: null | string;
  feed: Article[];
  /** Called when any article begins expanding; settles scroll restore. */
  onExpand?: () => void;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<null | string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  suppressSnapRef?: React.RefObject<false | number>;
  usePlaceholderData?: boolean;
}

export function useArticleActions({
  articleFilter,
  categories,
  distillStrategy,
  expandedArticleKey,
  feed,
  onExpand,
  setExpandedArticleKey,
  setFeed,
  suppressSnapRef,
  usePlaceholderData = false,
}: UseArticleActionsOptions) {
  const {
    handleToggleReadState,
    setArticleReadState,
    setUpdatingArticleState,
    updatingArticleState,
  } = useArticleReadState({ setFeed, usePlaceholderData });

  // Build a feedUrl → settings lookup from the category tree
  const getFeedSettings = useMemo(() => {
    const settingsMap = new Map<string, FeedExtractionSettings>();
    for (const cat of categories ?? []) {
      for (const child of cat.children ?? []) {
        if (child.data?.url) {
          settingsMap.set(child.data.url, {
            extractionDisabled: child.data.extractionDisabled,
            proxyEnabled: child.data.proxyEnabled,
          });
        }
      }
    }
    return (feedUrl: string) => settingsMap.get(feedUrl);
  }, [categories]);

  const {
    cancelHydration,
    hydrateArticleContent,
    hydratedArticleLinks,
    hydratingArticleLinks,
  } = useArticleHydration({ distillStrategy, getFeedSettings, setFeed });
  const autoHydratedExpandedKeyRef = useRef<null | string>(null);
  const awaitingExpandedSyncKeyRef = useRef<null | string>(null);
  const previousDistillStrategyRef = useRef(distillStrategy);

  // When the feed loads after a hot-reload or page refresh, the expandedArticleKey
  // is restored from sessionStorage but hydratedArticleLinks is in-memory only.
  // Re-trigger hydration so the article gets its rich content back automatically.
  useEffect(() => {
    if (!expandedArticleKey) {
      if (!awaitingExpandedSyncKeyRef.current) {
        autoHydratedExpandedKeyRef.current = null;
      }
      return;
    }

    if (awaitingExpandedSyncKeyRef.current === expandedArticleKey) {
      awaitingExpandedSyncKeyRef.current = null;
    }

    if (autoHydratedExpandedKeyRef.current === expandedArticleKey) {
      return;
    }

    if (feed.length === 0) return;

    const article = feed.find((a) => getArticleKey(a) === expandedArticleKey);
    const link = article?.link.trim() ?? "";
    if (
      article &&
      link &&
      !hydratedArticleLinks[link] &&
      !hydratingArticleLinks[link]
    ) {
      autoHydratedExpandedKeyRef.current = expandedArticleKey;
      void hydrateArticleContent(article);
    }
  }, [
    feed,
    expandedArticleKey,
    hydratedArticleLinks,
    hydratingArticleLinks,
    hydrateArticleContent,
  ]);

  const feedRef = useRef(feed);
  feedRef.current = feed;

  const scrollLock = useFeedScrollLock(suppressSnapRef);

  const collapseRemovalTimeoutRef = useRef<null | number>(null);
  const [collapsingArticleKey, setCollapsingArticleKey] = useState<
    null | string
  >(null);

  useEffect(() => {
    if (previousDistillStrategyRef.current === distillStrategy) return;

    previousDistillStrategyRef.current = distillStrategy;

    if (!expandedArticleKey || feed.length === 0) return;

    const article = feed.find((a) => getArticleKey(a) === expandedArticleKey);
    const link = article?.link.trim() ?? "";
    if (!article || !link || hydratingArticleLinks[link]) return;

    autoHydratedExpandedKeyRef.current = expandedArticleKey;
    void hydrateArticleContent(article, { force: true });
  }, [
    distillStrategy,
    expandedArticleKey,
    feed,
    hydratingArticleLinks,
    hydrateArticleContent,
  ]);

  useEffect(
    () => () => {
      if (collapseRemovalTimeoutRef.current !== null)
        window.clearTimeout(collapseRemovalTimeoutRef.current);
    },
    [],
  );

  const collapseExpandedArticle = useCallback(
    (article: Article, options?: { treatAsRead?: boolean }) => {
      const nextArticleKey = getArticleKey(article);
      const collapseRestoreTarget =
        scrollLock.getCollapseRestoreTarget(nextArticleKey);

      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : current,
      );
      awaitingExpandedSyncKeyRef.current = null;
      autoHydratedExpandedKeyRef.current = null;

      const link = article.link.trim();
      if (link) cancelHydration(link);

      scrollLock.activateCollapseLock(
        collapseRestoreTarget.viewport,
        collapseRestoreTarget.scrollTop,
      );

      const shouldAnimateRemoval =
        articleFilter === "unread" && (options?.treatAsRead ?? article.isRead);
      if (!shouldAnimateRemoval) return;

      if (collapseRemovalTimeoutRef.current !== null) {
        window.clearTimeout(collapseRemovalTimeoutRef.current);
      }
      setCollapsingArticleKey(nextArticleKey);
      collapseRemovalTimeoutRef.current = window.setTimeout(() => {
        setCollapsingArticleKey((current) =>
          current === nextArticleKey ? null : current,
        );
        collapseRemovalTimeoutRef.current = null;
      }, ARTICLE_REMOVAL_ANIMATION_MS);
    },
    [articleFilter, cancelHydration, scrollLock, setExpandedArticleKey],
  );

  const handleArticleToggle = useCallback(
    async (article: Article) => {
      const nextArticleKey = getArticleKey(article);
      const isCollapsing = expandedArticleKey === nextArticleKey;

      if (isCollapsing) {
        collapseExpandedArticle(article);
        return;
      }

      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : nextArticleKey,
      );

      // Cancel any in-progress scroll pin / collapse removal.
      if (collapseRemovalTimeoutRef.current !== null) {
        window.clearTimeout(collapseRemovalTimeoutRef.current);
        collapseRemovalTimeoutRef.current = null;
      }
      scrollLock.cancelLock();
      setCollapsingArticleKey(null);

      onExpand?.();
      scrollLock.activateExpandLock(nextArticleKey);

      if (!article.isRead && !updatingArticleState[nextArticleKey]) {
        void setArticleReadState(article, true, { suppressErrorToast: true });
      }

      // Mark as handled so the auto-hydration effect skips this key.
      awaitingExpandedSyncKeyRef.current = nextArticleKey;
      autoHydratedExpandedKeyRef.current = nextArticleKey;
      await hydrateArticleContent(article);
    },
    [
      collapseExpandedArticle,
      expandedArticleKey,
      onExpand,
      scrollLock,
      updatingArticleState,
      setExpandedArticleKey,
      setArticleReadState,
      hydrateArticleContent,
    ],
  );

  const handleExpandedSwipeRead = useCallback(
    (article: Article) => {
      const articleKey = getArticleKey(article);
      if (!article.isRead && !updatingArticleState[articleKey]) {
        void setArticleReadState(article, true, { suppressErrorToast: true });
      }
      collapseExpandedArticle(article, { treatAsRead: true });
    },
    [collapseExpandedArticle, setArticleReadState, updatingArticleState],
  );

  const handleToggleStarredState = useCallback(
    async (article: Article) => {
      const articleKey = getArticleKey(article);
      const nextStarredState = !article.isStarred;

      setUpdatingArticleState((current) => ({
        ...current,
        [articleKey]: true,
      }));

      setFeed((currentFeed) => {
        const updated = currentFeed.map((a) =>
          getArticleKey(a) === articleKey
            ? { ...a, isStarred: nextStarredState }
            : a,
        );
        if (articleFilter === "starred" && !nextStarredState) {
          return updated.filter((a) => getArticleKey(a) !== articleKey);
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
          const reverted = currentFeed.map((a) =>
            getArticleKey(a) === articleKey
              ? { ...a, isStarred: article.isStarred }
              : a,
          );

          if (articleFilter === "starred" && article.isStarred) {
            const alreadyPresent = reverted.some(
              (a) => getArticleKey(a) === articleKey,
            );
            if (!alreadyPresent) return [article, ...reverted];
          }

          return reverted;
        });
        toast.error("Unable to update starred state right now.");
      } finally {
        setUpdatingArticleState(({ [articleKey]: _, ...rest }) => rest);
      }
    },
    [articleFilter, setFeed, setUpdatingArticleState, usePlaceholderData],
  );

  return {
    collapsingArticleKey,
    handleArticleToggle,
    handleExpandedSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
    hydratedArticleLinks,
    hydratingArticleLinks,
    setArticleReadState,
    updatingArticleState,
  };
}
