"use client";

import { ArticleService, type Article, type CategoryTreeNode } from "@/lib";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getArticleKey } from "../services/article-collection";
import {
  escapeArticleKey,
  useArticleHydration,
  type FeedExtractionSettings,
} from "./useArticleHydration";
import { getNextArticle } from "./useArticleNavigation";
import { useArticleReadState } from "./useArticleReadState";

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
}

export function useArticleActions({
  feed,
  setFeed,
  expandedArticleKey,
  setExpandedArticleKey,
  articleFilter,
  usePlaceholderData = false,
  categories,
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
  } = useArticleHydration({ setFeed, getFeedSettings });
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

  const collapseRemovalTimeoutRef = useRef<number | null>(null);
  const collapseScrollTimeoutRef = useRef<number | null>(null);
  const [collapsingArticleKey, setCollapsingArticleKey] = useState<
    string | null
  >(null);

  useEffect(
    () => () => {
      if (collapseRemovalTimeoutRef.current !== null) {
        window.clearTimeout(collapseRemovalTimeoutRef.current);
      }
      if (collapseScrollTimeoutRef.current !== null) {
        window.clearTimeout(collapseScrollTimeoutRef.current);
      }
    },
    [],
  );

  const scrollArticleToTop = useCallback((targetKey: string) => {
    let el: HTMLElement | null = null;
    try {
      el = document.querySelector<HTMLElement>(
        `[data-article-key="${escapeArticleKey(targetKey)}"]`,
      );
    } catch {
      el = null;
    }
    if (!el) {
      for (const candidate of Array.from(document.getElementsByTagName("*"))) {
        if (
          candidate instanceof HTMLElement &&
          candidate.getAttribute("data-article-key") === targetKey
        ) {
          el = candidate;
          break;
        }
      }
    }
    if (!el) return;

    const viewport = el.closest<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }

    const targetScrollTop = Math.max(
      0,
      Math.min(
        viewport.scrollTop +
          (el.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top),
        Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      ),
    );
    if (Math.abs(viewport.scrollTop - targetScrollTop) <= 1) return;
    viewport.scrollTo({ top: targetScrollTop, behavior: "smooth" });
  }, []);

  const handleArticleToggle = useCallback(
    async (article: Article) => {
      const nextArticleKey = getArticleKey(article);
      const isCollapsing = expandedArticleKey === nextArticleKey;

      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : nextArticleKey,
      );

      if (isCollapsing) {
        awaitingExpandedSyncKeyRef.current = null;
        autoHydratedExpandedKeyRef.current = null;
        // Cancel any pending extract request for this article
        const link = article.link?.trim();
        if (link) cancelHydration(link);

        if (collapseScrollTimeoutRef.current !== null) {
          window.clearTimeout(collapseScrollTimeoutRef.current);
        }
        // After the collapse CSS transition (~150–240ms), scroll to the top of the
        // target article: next article if already read, current article if unread.
        const nextArticle = article.isRead
          ? getNextArticle(feedRef.current, article.id)
          : null;
        const scrollTargetKey = nextArticle
          ? getArticleKey(nextArticle)
          : nextArticleKey;
        collapseScrollTimeoutRef.current = window.setTimeout(() => {
          scrollArticleToTop(scrollTargetKey);
          collapseScrollTimeoutRef.current = null;
        }, 250);

        // Schedule animated removal from the unread filter for read articles
        if (articleFilter === "unread" && article.isRead) {
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
        }
        return;
      }

      // Expanding: cancel any in-progress collapse animation first
      if (collapseRemovalTimeoutRef.current !== null) {
        window.clearTimeout(collapseRemovalTimeoutRef.current);
        collapseRemovalTimeoutRef.current = null;
      }
      if (collapseScrollTimeoutRef.current !== null) {
        window.clearTimeout(collapseScrollTimeoutRef.current);
        collapseScrollTimeoutRef.current = null;
      }
      setCollapsingArticleKey(null);

      if (!article.isRead && !updatingArticleState[nextArticleKey]) {
        void setArticleReadState(article, true, { suppressErrorToast: true });
      }

      // Manual expand already triggers hydration; mark this key as handled so
      // the auto-hydration effect does not schedule a second extraction request.
      awaitingExpandedSyncKeyRef.current = nextArticleKey;
      autoHydratedExpandedKeyRef.current = nextArticleKey;
      await hydrateArticleContent(article);
    },
    [
      articleFilter,
      cancelHydration,
      expandedArticleKey,
      updatingArticleState,
      setExpandedArticleKey,
      setArticleReadState,
      hydrateArticleContent,
      scrollArticleToTop,
    ],
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
    handleToggleReadState,
    handleToggleStarredState,
    setArticleReadState,
  };
}
