"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { type Article, ArticleService, type CategoryTreeNode } from "@/lib";

import { getArticleKey } from "../services/article-collection";
import {
  escapeArticleKey,
  type FeedExtractionSettings,
  useArticleHydration,
} from "./useArticleHydration";
import { useArticleReadState } from "./useArticleReadState";

/**
 * Duration used to keep unread-filter removals mounted while the row exits.
 */
export const ARTICLE_REMOVAL_ANIMATION_MS = 180;
export const ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS = 130;
const ARTICLE_SCROLL_RESTORE_BUFFER_MS = 900;
export type ArticleRemovalAnimationMode =
  | "collapse"
  | "de-expanding"
  | "swipe-read";

export type CollapsingArticles = Partial<Record<string, CollapsingArticleState>>;

export interface CollapsingArticleState {
  article: Article;
  index: number;
  mode: ArticleRemovalAnimationMode;
}

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

/** Returns the mounted lifetime for a staged unread-removal mode. */
export function getArticleRemovalAnimationDuration(
  mode: ArticleRemovalAnimationMode,
) {
  return mode === "de-expanding"
    ? ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS
    : ARTICLE_REMOVAL_ANIMATION_MS;
}

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
  const collapseRemovalTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const collapseScrollRestoreCleanupRef = useRef<(() => void) | null>(null);
  const preExpandArticleKeyRef = useRef<null | string>(null);
  const preExpandScrollTopRef = useRef<null | number>(null);
  const preExpandViewportRef = useRef<HTMLElement | null>(null);
  const previousDistillStrategyRef = useRef(distillStrategy);
  const [isCollapseScrollRestoreActive, setIsCollapseScrollRestoreActive] =
    useState(false);
  const [collapsingArticles, setCollapsingArticles] =
    useState<CollapsingArticles>({});

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
      !article.hasFullContent &&
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

  useEffect(() => {
    const removalTimeouts = collapseRemovalTimeoutsRef.current;

    return () => {
      setIsCollapseScrollRestoreActive(false);
      collapseScrollRestoreCleanupRef.current?.();
      collapseScrollRestoreCleanupRef.current = null;
      for (const timeoutId of removalTimeouts.values()) {
        clearTimeout(timeoutId);
      }
      removalTimeouts.clear();
    };
  }, []);

  const clearPreExpandSnapshot = useCallback(() => {
    preExpandArticleKeyRef.current = null;
    preExpandScrollTopRef.current = null;
    preExpandViewportRef.current = null;
  }, []);

  const cancelCollapseScrollRestore = useCallback(() => {
    collapseScrollRestoreCleanupRef.current?.();
    collapseScrollRestoreCleanupRef.current = null;
    setIsCollapseScrollRestoreActive(false);
  }, []);

  const capturePreExpandSnapshot = useCallback((article: Article) => {
    const articleKey = getArticleKey(article);
    const articleElement = document.querySelector<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    );
    const viewport =
      articleElement?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      null;

    if (!articleElement || !viewport) {
      return;
    }

    preExpandArticleKeyRef.current = articleKey;
    preExpandScrollTopRef.current = viewport.scrollTop;
    preExpandViewportRef.current = viewport;
  }, []);

  const restoreCollapseScrollPosition = useCallback(
    (articleKey: string) => {
      const targetScrollTop =
        preExpandArticleKeyRef.current === articleKey
          ? preExpandScrollTopRef.current
          : null;
      const viewport =
        preExpandArticleKeyRef.current === articleKey
          ? preExpandViewportRef.current
          : null;

      if (targetScrollTop === null || !viewport) {
        setIsCollapseScrollRestoreActive(false);
        clearPreExpandSnapshot();
        return;
      }

      cancelCollapseScrollRestore();
      setIsCollapseScrollRestoreActive(true);

      const releaseAt =
        performance.now() +
        ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS +
        ARTICLE_SCROLL_RESTORE_BUFFER_MS;
      let animationFrameId = 0;

      const syncViewportScroll = () => {
        viewport.scrollTop = targetScrollTop;

        if (performance.now() >= releaseAt) {
          viewport.scrollTop = targetScrollTop;
          setIsCollapseScrollRestoreActive(false);
          clearPreExpandSnapshot();
          collapseScrollRestoreCleanupRef.current = null;
          return;
        }

        animationFrameId = window.requestAnimationFrame(syncViewportScroll);
      };

      syncViewportScroll();

      collapseScrollRestoreCleanupRef.current = () => {
        if (animationFrameId !== 0) {
          window.cancelAnimationFrame(animationFrameId);
        }
        setIsCollapseScrollRestoreActive(false);
      };
    },
    [cancelCollapseScrollRestore, clearPreExpandSnapshot],
  );

  const clearRemovalAnimation = useCallback((articleKey: string) => {
    const timeoutId = collapseRemovalTimeoutsRef.current.get(articleKey);
    if (timeoutId) {
      clearTimeout(timeoutId);
      collapseRemovalTimeoutsRef.current.delete(articleKey);
    }

    setCollapsingArticles((current) => {
      if (!current[articleKey]) {
        return current;
      }

      const { [articleKey]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const startRemovalAnimation = useCallback(
    (article: Article, mode: ArticleRemovalAnimationMode) => {
      const articleKey = getArticleKey(article);
      const index = feed.findIndex((candidate) => getArticleKey(candidate) === articleKey);

      if (index < 0) {
        return;
      }

      const timeoutId = collapseRemovalTimeoutsRef.current.get(articleKey);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      setCollapsingArticles((current) => ({
        ...current,
        [articleKey]: {
          article,
          index,
          mode,
        },
      }));

      collapseRemovalTimeoutsRef.current.set(
        articleKey,
        setTimeout(() => {
          collapseRemovalTimeoutsRef.current.delete(articleKey);
          setCollapsingArticles((current) => {
            if (!current[articleKey]) {
              return current;
            }

            const { [articleKey]: _removed, ...rest } = current;
            return rest;
          });
        }, getArticleRemovalAnimationDuration(mode)),
      );
    },
    [feed],
  );

  useEffect(() => {
    if (previousDistillStrategyRef.current === distillStrategy) return;

    previousDistillStrategyRef.current = distillStrategy;

    if (!expandedArticleKey || feed.length === 0) return;

    const article = feed.find((a) => getArticleKey(a) === expandedArticleKey);
    const link = article?.link.trim() ?? "";
    const feedUrl = article?.feedUrl?.trim() ?? "";
    if (feedUrl && getFeedSettings(feedUrl)?.extractionDisabled) return;
    if (!article || !link || hydratingArticleLinks[link]) return;

    autoHydratedExpandedKeyRef.current = expandedArticleKey;
    void hydrateArticleContent(article, { force: true });
  }, [
    distillStrategy,
    expandedArticleKey,
    feed,
    getFeedSettings,
    hydratingArticleLinks,
    hydrateArticleContent,
  ]);

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
      awaitingExpandedSyncKeyRef.current = null;
      autoHydratedExpandedKeyRef.current = null;

      const link = article.link.trim();
      if (link) cancelHydration(link);
    },
    [
      articleFilter,
      cancelHydration,
      clearRemovalAnimation,
      restoreCollapseScrollPosition,
      setExpandedArticleKey,
      startRemovalAnimation,
    ],
  );

  const handleArticleToggle = useCallback(
    (article: Article) => {
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
        void setArticleReadState(article, true, { suppressErrorToast: true });
      }

      // Mark as handled so the auto-hydration effect skips this key.
      awaitingExpandedSyncKeyRef.current = nextArticleKey;
      autoHydratedExpandedKeyRef.current = nextArticleKey;
      void hydrateArticleContent(article);
    },
    [
      articleFilter,
      cancelCollapseScrollRestore,
      clearRemovalAnimation,
      collapseExpandedArticle,
      expandedArticleKey,
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
      collapseExpandedArticle(article, {
        animationMode: "swipe-read",
        treatAsRead: true,
      });
    },
    [collapseExpandedArticle, setArticleReadState, updatingArticleState],
  );

  /** Applies swipe-driven read toggles immediately without staging a row exit. */
  const handleSwipeRead = useCallback(
    async (article: Article) => {
      if (articleFilter === "unread" && !article.isRead) {
        startRemovalAnimation(article, "swipe-read");
      }

      await toggleArticleReadState(article);
    },
    [articleFilter, startRemovalAnimation, toggleArticleReadState],
  );

  /** Applies direct read toggles and stages unread-filter removals for exit motion. */
  const handleToggleReadState = useCallback(
    async (article: Article) => {
      const nextReadState = !article.isRead;
      if (articleFilter === "unread" && nextReadState) {
        startRemovalAnimation(article, "collapse");
      }

      await toggleArticleReadState(article);
    },
    [articleFilter, startRemovalAnimation, toggleArticleReadState],
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
    capturePreExpandSnapshot,
    collapsingArticles,
    handleArticleToggle,
    handleExpandedSwipeRead,
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
