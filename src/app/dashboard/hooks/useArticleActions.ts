"use client";

import { ArticleService, type Article } from "@/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getArticleKey } from "../services/article-collection";
import { escapeArticleKey, useArticleHydration } from "./useArticleHydration";
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
}

export function useArticleActions({
  feed,
  setFeed,
  expandedArticleKey,
  setExpandedArticleKey,
  articleFilter,
}: UseArticleActionsOptions) {
  const {
    updatingArticleState,
    setUpdatingArticleState,
    setArticleReadState,
    handleToggleReadState,
  } = useArticleReadState({ setFeed });

  const { hydratedArticleLinks, hydratingArticleLinks, hydrateArticleContent } =
    useArticleHydration({ setFeed });
  const autoHydratedExpandedKeyRef = useRef<string | null>(null);

  // When the feed loads after a hot-reload or page refresh, the expandedArticleKey
  // is restored from sessionStorage but hydratedArticleLinks is in-memory only.
  // Re-trigger hydration so the article gets its rich content back automatically.
  useEffect(() => {
    if (!expandedArticleKey) {
      autoHydratedExpandedKeyRef.current = null;
      return;
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

  const scrollCollapsedArticleIntoView = useCallback(
    (collapsingKey: string) => {
      let collapsingEl: HTMLElement | null = null;
      try {
        collapsingEl = document.querySelector<HTMLElement>(
          `[data-article-key="${escapeArticleKey(collapsingKey)}"]`,
        );
      } catch {
        collapsingEl = null;
      }

      if (!collapsingEl) {
        for (const candidate of Array.from(
          document.getElementsByTagName("*"),
        )) {
          if (
            candidate instanceof HTMLElement &&
            candidate.getAttribute("data-article-key") === collapsingKey
          ) {
            collapsingEl = candidate;
            break;
          }
        }
      }

      if (!collapsingEl) return;

      // Scroll the collapsed article itself back into view so user can see where they were
      collapsingEl.scrollIntoView({ block: "start", behavior: "smooth" });
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
        if (collapseScrollTimeoutRef.current !== null) {
          window.clearTimeout(collapseScrollTimeoutRef.current);
        }
        // After the collapse CSS transition (~150–240ms), scroll the collapsed article back into view
        collapseScrollTimeoutRef.current = window.setTimeout(() => {
          scrollCollapsedArticleIntoView(nextArticleKey);
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
      await hydrateArticleContent(article, { force: true });
    },
    [
      articleFilter,
      expandedArticleKey,
      updatingArticleState,
      setExpandedArticleKey,
      setArticleReadState,
      hydrateArticleContent,
      scrollCollapsedArticleIntoView,
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
        await ArticleService.updateArticleStatus(article.id, {
          isStarred: nextStarredState,
        });
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
    [articleFilter, setFeed, setUpdatingArticleState],
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
