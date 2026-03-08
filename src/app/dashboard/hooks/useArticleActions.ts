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
import { useArticleReadState } from "./useArticleReadState";

const ARTICLE_REMOVAL_ANIMATION_MS = 320;
// Must match CSS `duration-700` on the ArticleCard container transition.
const ARTICLE_COLLAPSE_TRANSITION_MS = 700;

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
  const collapseScrollTimerRef = useRef<number | null>(null);
  const collapseScrollRafRef = useRef(0);
  // Viewport state captured at expansion time; restored on collapse.
  const preExpandScrollRef = useRef<{
    viewport: HTMLElement;
    top: number;
  } | null>(null);
  const [collapsingArticleKey, setCollapsingArticleKey] = useState<
    string | null
  >(null);

  useEffect(
    () => () => {
      if (collapseRemovalTimeoutRef.current !== null)
        window.clearTimeout(collapseRemovalTimeoutRef.current);
      if (collapseScrollTimerRef.current !== null)
        window.clearTimeout(collapseScrollTimerRef.current);
      if (collapseScrollRafRef.current)
        cancelAnimationFrame(collapseScrollRafRef.current);
    },
    [],
  );

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

        if (collapseScrollTimerRef.current !== null) {
          window.clearTimeout(collapseScrollTimerRef.current);
          collapseScrollTimerRef.current = null;
        }
        if (collapseScrollRafRef.current) {
          cancelAnimationFrame(collapseScrollRafRef.current);
          collapseScrollRafRef.current = 0;
        }

        // Restore scroll position to where it was before the article was expanded.
        // Wait for the CSS collapse transition (duration-700) then one rAF to
        // ensure the browser has committed the final layout before reading geometry.
        const saved = preExpandScrollRef.current;
        preExpandScrollRef.current = null;
        if (saved) {
          collapseScrollTimerRef.current = window.setTimeout(() => {
            collapseScrollTimerRef.current = null;
            collapseScrollRafRef.current = requestAnimationFrame(() => {
              collapseScrollRafRef.current = 0;
              if (Math.abs(saved.viewport.scrollTop - saved.top) <= 1) return;
              saved.viewport.scrollTo({ top: saved.top, behavior: "smooth" });
            });
          }, ARTICLE_COLLAPSE_TRANSITION_MS);
        }

        // Animate removal from the unread filter for read articles.
        const isRemovingFromFilter =
          articleFilter === "unread" && article.isRead;
        if (isRemovingFromFilter) {
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

      // Expanding: cancel any in-progress collapse animation/scroll first.
      if (collapseRemovalTimeoutRef.current !== null) {
        window.clearTimeout(collapseRemovalTimeoutRef.current);
        collapseRemovalTimeoutRef.current = null;
      }
      if (collapseScrollTimerRef.current !== null) {
        window.clearTimeout(collapseScrollTimerRef.current);
        collapseScrollTimerRef.current = null;
      }
      if (collapseScrollRafRef.current) {
        cancelAnimationFrame(collapseScrollRafRef.current);
        collapseScrollRafRef.current = 0;
      }
      setCollapsingArticleKey(null);

      // Capture scroll position before expanding so we can restore it on collapse.
      try {
        const el = document.querySelector<HTMLElement>(
          `[data-article-key="${escapeArticleKey(nextArticleKey)}"]`,
        );
        const viewport = el?.closest<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        preExpandScrollRef.current = viewport
          ? { viewport, top: viewport.scrollTop }
          : null;
      } catch {
        preExpandScrollRef.current = null;
      }

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
