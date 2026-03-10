"use client";

import { ArticleService, type Article, type CategoryTreeNode } from "@/lib";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getArticleKey } from "../services/article-collection";
import {
  useArticleHydration,
  type FeedExtractionSettings,
} from "./useArticleHydration";
import { useArticleReadState } from "./useArticleReadState";
import { useScrollPin } from "./useScrollPin";

const ARTICLE_REMOVAL_ANIMATION_MS = 320;

export const toggleReadStatus = (isRead: boolean) => !isRead;
export const toggleStarredStatus = (isStarred: boolean) => !isStarred;

interface UseArticleActionsOptions {
  feed: Article[];
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  expandedArticleKey: string | null;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<string | null>>;
  articleFilter: "all" | "unread" | "read" | "starred";
  usePlaceholderData?: boolean;
  categories?: CategoryTreeNode[];
  distillStrategy?: string;
  /** Called when any article begins expanding; settles scroll restore. */
  onExpand?: () => void;
  /**
   * Scroll-pin coordinate ref shared with usePullDownToRefresh.
   * See useScrollPin.ts for the full three-mode protocol documentation.
   */
  suppressSnapRef?: React.RefObject<number | false>;
}

export function useArticleActions({
  feed,
  setFeed,
  expandedArticleKey,
  setExpandedArticleKey,
  articleFilter,
  usePlaceholderData = false,
  categories,
  distillStrategy,
  onExpand,
  suppressSnapRef,
}: UseArticleActionsOptions) {
  const {
    updatingArticleState,
    setUpdatingArticleState,
    setArticleReadState,
    handleToggleReadState,
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
    hydratedArticleLinks,
    hydratingArticleLinks,
    hydrateArticleContent,
    cancelHydration,
  } = useArticleHydration({ setFeed, getFeedSettings, distillStrategy });
  const autoHydratedExpandedKeyRef = useRef<string | null>(null);
  const awaitingExpandedSyncKeyRef = useRef<string | null>(null);

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
    const link = article?.link?.trim() ?? "";
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

  const scrollPin = useScrollPin(suppressSnapRef);
  const collapseRemovalTimeoutRef = useRef<number | null>(null);
  const [collapsingArticleKey, setCollapsingArticleKey] = useState<
    string | null
  >(null);

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

      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : current,
      );
      awaitingExpandedSyncKeyRef.current = null;
      autoHydratedExpandedKeyRef.current = null;

      const link = article.link?.trim();
      if (link) cancelHydration(link);

      scrollPin.activateCollapsePin(
        scrollPin.preExpandViewport.current,
        scrollPin.preExpandScrollTop.current,
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
    [articleFilter, cancelHydration, scrollPin, setExpandedArticleKey],
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
      scrollPin.cancelPin();
      setCollapsingArticleKey(null);

      // Settle scroll-restore window before expand layout changes.
      onExpand?.();

      // Suppress ResizeObserver during CSS expand transition.
      // See useScrollPin.ts for the full expand-suppress protocol.
      scrollPin.activateExpandSuppress(nextArticleKey);

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
      scrollPin,
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
    updatingArticleState,
    hydratedArticleLinks,
    hydratingArticleLinks,
    collapsingArticleKey,
    handleArticleToggle,
    handleExpandedSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
    setArticleReadState,
  };
}
