"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { type Article, ArticleService, type CategoryTreeNode } from "@/lib";

import { getArticleKey } from "../services/article-collection";
import { toggleReadStatus } from "./article-toggle-state";
import { getScrollLockReleaseMs } from "./feed-surface-scroll-lock";
import {
  type FeedExtractionSettings,
  useArticleHydration,
} from "./useArticleHydration";
import { useArticleReadState } from "./useArticleReadState";
import { useFeedScrollLock } from "./useFeedSurface";

/** Duration used to keep unread-filter removals mounted while the row exits. */
export const ARTICLE_REMOVAL_ANIMATION_MS = 320;
export const ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS = 220;
export type ArticleRemovalAnimationMode =
  | "collapse"
  | "de-expanding"
  | "swipe-read";

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
  onExpand,
  setExpandedArticleKey,
  setFeed,
  suppressSnapRef,
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

  const feedRef = useRef(feed);
  feedRef.current = feed;

  const scrollLock = useFeedScrollLock(suppressSnapRef);

  const collapseSettleTimeoutRef = useRef<null | number>(null);
  const collapseRemovalTimeoutRef = useRef<null | number>(null);
  const [collapseSettlingArticleKey, setCollapseSettlingArticleKey] = useState<
    null | string
  >(null);
  const [collapsingArticleKey, setCollapsingArticleKey] = useState<
    null | string
  >(null);
  const [collapsingArticleMode, setCollapsingArticleMode] =
    useState<ArticleRemovalAnimationMode | null>(null);

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

  useEffect(
    () => () => {
      if (collapseSettleTimeoutRef.current !== null) {
        window.clearTimeout(collapseSettleTimeoutRef.current);
      }
      if (collapseRemovalTimeoutRef.current !== null)
        window.clearTimeout(collapseRemovalTimeoutRef.current);
    },
    [],
  );

  /** Keeps the feed surface stable while collapse scroll restoration settles. */
  const stageCollapseSettling = useCallback((articleKey: string) => {
    if (collapseSettleTimeoutRef.current !== null) {
      window.clearTimeout(collapseSettleTimeoutRef.current);
    }

    setCollapseSettlingArticleKey(articleKey);
    collapseSettleTimeoutRef.current = window.setTimeout(() => {
      setCollapseSettlingArticleKey((current) =>
        current === articleKey ? null : current,
      );
      collapseSettleTimeoutRef.current = null;
    }, getScrollLockReleaseMs());
  }, []);

  const clearCollapseSettling = useCallback(() => {
    if (collapseSettleTimeoutRef.current !== null) {
      window.clearTimeout(collapseSettleTimeoutRef.current);
      collapseSettleTimeoutRef.current = null;
    }
    setCollapseSettlingArticleKey(null);
  }, []);

  /** Keeps a soon-to-be-removed unread article mounted long enough to animate out. */
  const startRemovalAnimation = useCallback(
    (articleKey: string, mode: ArticleRemovalAnimationMode = "collapse") => {
      const removalDuration = getArticleRemovalAnimationDuration(mode);
      if (collapseRemovalTimeoutRef.current !== null) {
        window.clearTimeout(collapseRemovalTimeoutRef.current);
      }
      setCollapsingArticleKey(articleKey);
      setCollapsingArticleMode(mode);
      collapseRemovalTimeoutRef.current = window.setTimeout(() => {
        setCollapsingArticleKey((current) =>
          current === articleKey ? null : current,
        );
        setCollapsingArticleMode((current) =>
          current === mode ? null : current,
        );
        collapseRemovalTimeoutRef.current = null;
      }, removalDuration);
    },
    [],
  );

  const collapseExpandedArticle = useCallback(
    (
      article: Article,
      options?: {
        animateRemoval?: boolean;
        animationMode?: ArticleRemovalAnimationMode;
        treatAsRead?: boolean;
      },
    ) => {
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
      stageCollapseSettling(nextArticleKey);

      const shouldAnimateRemoval =
        options?.animateRemoval !== false &&
        articleFilter === "unread" &&
        (options?.treatAsRead ?? article.isRead);
      if (!shouldAnimateRemoval) return;

      startRemovalAnimation(
        nextArticleKey,
        options?.animationMode ?? "de-expanding",
      );
    },
    [
      articleFilter,
      cancelHydration,
      scrollLock,
      setExpandedArticleKey,
      stageCollapseSettling,
      startRemovalAnimation,
    ],
  );

  const handleArticleToggle = useCallback(
    async (article: Article) => {
      const nextArticleKey = getArticleKey(article);
      const isCollapsing = expandedArticleKey === nextArticleKey;

      if (isCollapsing) {
        collapseExpandedArticle(article, {
          treatAsRead: articleFilter === "unread" ? true : undefined,
        });
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
      clearCollapseSettling();
      scrollLock.cancelLock();
      setCollapsingArticleKey(null);
      setCollapsingArticleMode(null);

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
      articleFilter,
      clearCollapseSettling,
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
      collapseExpandedArticle(article, {
        animateRemoval: true,
        animationMode: "swipe-read",
        treatAsRead: true,
      });
    },
    [collapseExpandedArticle, setArticleReadState, updatingArticleState],
  );

  /** Captures the pre-expand scroll position before pointer focus can move it. */
  const prepareArticleExpand = useCallback(
    (article: Article) => {
      const articleKey = getArticleKey(article);
      if (expandedArticleKey === articleKey) return;
      scrollLock.capturePreExpandSnapshot(articleKey);
    },
    [expandedArticleKey, scrollLock],
  );

  /** Applies swipe-driven read toggles while using the off-screen exit animation. */
  const handleSwipeRead = useCallback(
    async (article: Article) => {
      const nextReadState = toggleReadStatus(Boolean(article.isRead));
      if (articleFilter === "unread" && nextReadState) {
        startRemovalAnimation(getArticleKey(article), "swipe-read");
      }
      await toggleArticleReadState(article);
    },
    [articleFilter, startRemovalAnimation, toggleArticleReadState],
  );

  /** Applies direct read toggles and stages unread-filter removals for exit motion. */
  const handleToggleReadState = useCallback(
    async (article: Article) => {
      const nextReadState = toggleReadStatus(Boolean(article.isRead));
      if (articleFilter === "unread" && nextReadState) {
        startRemovalAnimation(getArticleKey(article));
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
    collapseSettlingArticleKey,
    collapsingArticleKey,
    collapsingArticleMode,
    handleArticleToggle,
    handleExpandedSwipeRead,
    handleSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
    hydratedArticleLinks,
    hydratingArticleLinks,
    prepareArticleExpand,
    setArticleReadState,
    updatingArticleState,
  };
}
