"use client";

import { ArticleService, type Article } from "@/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getArticleKey } from "../helpers/article-helpers";
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
  feed: _feed,
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

  const {
    hydratedArticleLinks,
    hydratingArticleLinks,
    scrollArticleIntoView,
    hydrateArticleContent,
  } = useArticleHydration({ setFeed });

  const expandedArticleKeyRef = useRef<string | null>(null);
  const collapseRemovalTimeoutRef = useRef<number | null>(null);
  const [collapsingArticleKey, setCollapsingArticleKey] = useState<
    string | null
  >(null);

  // Keep ref in sync with state for use inside callbacks
  expandedArticleKeyRef.current = expandedArticleKey;

  useEffect(
    () => () => {
      if (collapseRemovalTimeoutRef.current !== null) {
        window.clearTimeout(collapseRemovalTimeoutRef.current);
      }
    },
    [],
  );

  const scrollNextArticleIntoView = useCallback((collapsingKey: string) => {
    const collapsingEl = document.querySelector<HTMLElement>(
      `[data-article-key="${escapeArticleKey(collapsingKey)}"]`,
    );
    if (!collapsingEl) return;

    // Walk forward through sibling elements to find the next article card
    let sibling = collapsingEl.nextElementSibling as HTMLElement | null;
    while (sibling && !sibling.dataset.articleKey) {
      sibling = sibling.nextElementSibling as HTMLElement | null;
    }

    if (sibling?.dataset.articleKey) {
      sibling.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, []);

  const handleArticleToggle = useCallback(
    async (article: Article) => {
      const nextArticleKey = getArticleKey(article);
      const isCollapsing = expandedArticleKey === nextArticleKey;

      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : nextArticleKey,
      );

      if (isCollapsing) {
        // After the collapse CSS transition (~150–240ms), scroll the next article to the top
        window.setTimeout(() => {
          scrollNextArticleIntoView(nextArticleKey);
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
      setCollapsingArticleKey(null);

      if (!article.isRead && !updatingArticleState[nextArticleKey]) {
        void setArticleReadState(article, true, { suppressErrorToast: true });
      }

      requestAnimationFrame(() => scrollArticleIntoView(nextArticleKey));
      await hydrateArticleContent(article);

      // Scroll again after hydration in case the card grew
      if (expandedArticleKeyRef.current === nextArticleKey) {
        requestAnimationFrame(() => scrollArticleIntoView(nextArticleKey));
      }
    },
    [
      articleFilter,
      expandedArticleKey,
      updatingArticleState,
      setExpandedArticleKey,
      setArticleReadState,
      hydrateArticleContent,
      scrollArticleIntoView,
      scrollNextArticleIntoView,
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
