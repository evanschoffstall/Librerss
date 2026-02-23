"use client";

import { ArticleService, isValidUrl, type Article } from "@/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getArticleKey } from "../helpers/article-helpers";

const ARTICLE_REMOVAL_ANIMATION_MS = 320;

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
  const [updatingArticleState, setUpdatingArticleState] = useState<
    Record<string, boolean>
  >({});
  const [hydratedArticleLinks, setHydratedArticleLinks] = useState<
    Record<string, boolean>
  >({});
  const [hydratingArticleLinks, setHydratingArticleLinks] = useState<
    Record<string, boolean>
  >({});
  const hydratedArticleLinksRef = useRef(new Set<string>());
  const articleHydrationInFlightRef = useRef(new Set<string>());
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

  const scrollArticleIntoView = useCallback((articleKey: string) => {
    const escapedKey =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(articleKey)
        : articleKey.replace(/[\\"]/g, "\\$&");

    const el = document.querySelector<HTMLElement>(
      `[data-article-key="${escapedKey}"]`,
    );
    el?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }, []);

  const setArticleReadState = useCallback(
    async (
      article: Article,
      nextReadState: boolean,
      options?: { suppressErrorToast?: boolean },
    ) => {
      const articleKey = getArticleKey(article);

      setUpdatingArticleState((current) => ({
        ...current,
        [articleKey]: true,
      }));
      setFeed((currentFeed) =>
        currentFeed.map((a) =>
          getArticleKey(a) === articleKey ? { ...a, isRead: nextReadState } : a,
        ),
      );

      try {
        await ArticleService.setArticleReadState(article.id, nextReadState);
      } catch (error) {
        console.error("Set read state error:", error);
        setFeed((currentFeed) =>
          currentFeed.map((a) =>
            getArticleKey(a) === articleKey
              ? { ...a, isRead: article.isRead }
              : a,
          ),
        );
        if (!options?.suppressErrorToast) {
          toast.error("Unable to update read state right now.");
        }
      } finally {
        setUpdatingArticleState((current) => {
          const { [articleKey]: _, ...rest } = current;
          return rest;
        });
      }
    },
    [setFeed],
  );

  const hydrateArticleContent = useCallback(
    async (article: Article) => {
      const link = article.link?.trim();
      if (!link || !isValidUrl(link)) return;
      if (
        hydratedArticleLinksRef.current.has(link) ||
        articleHydrationInFlightRef.current.has(link)
      )
        return;

      articleHydrationInFlightRef.current.add(link);
      setHydratingArticleLinks((current) => ({ ...current, [link]: true }));

      try {
        const extractedContent =
          await ArticleService.extractArticleContent(link);

        if (!extractedContent) {
          hydratedArticleLinksRef.current.add(link);
          return;
        }

        setFeed((currentFeed) =>
          currentFeed.map((a) => {
            if (a.link.trim() !== link) return a;
            if ((extractedContent.length ?? 0) <= (a.content?.length ?? 0))
              return a;
            return { ...a, content: extractedContent };
          }),
        );

        hydratedArticleLinksRef.current.add(link);
        setHydratedArticleLinks((current) => ({ ...current, [link]: true }));
      } catch (error) {
        console.error("Article hydration error:", error);
      } finally {
        articleHydrationInFlightRef.current.delete(link);
        setHydratingArticleLinks((current) => {
          if (!current[link]) return current;
          const { [link]: _, ...rest } = current;
          return rest;
        });
      }
    },
    [setFeed],
  );

  const handleArticleToggle = useCallback(
    async (article: Article) => {
      const nextArticleKey = getArticleKey(article);
      const isCollapsing = expandedArticleKey === nextArticleKey;

      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : nextArticleKey,
      );

      if (isCollapsing) {
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
    ],
  );

  const handleToggleReadState = useCallback(
    async (article: Article) => {
      await setArticleReadState(article, !article.isRead);
    },
    [setArticleReadState],
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
        await ArticleService.setArticleStarredState(
          article.id,
          nextStarredState,
        );
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
        setUpdatingArticleState((current) => {
          const { [articleKey]: _, ...rest } = current;
          return rest;
        });
      }
    },
    [articleFilter, setFeed],
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
