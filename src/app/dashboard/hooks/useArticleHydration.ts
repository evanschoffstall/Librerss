"use client";

import { ArticleService, isValidUrl, type Article } from "@/lib";
import { useCallback, useRef, useState } from "react";

interface UseArticleHydrationOptions {
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
}

/** Safely escape an article key for use in a CSS attribute selector. */
export function escapeArticleKey(articleKey: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(articleKey)
    : articleKey.replace(/[\\"]/g, "\\$&");
}

export function useArticleHydration({ setFeed }: UseArticleHydrationOptions) {
  const [hydratedArticleLinks, setHydratedArticleLinks] = useState<
    Record<string, boolean>
  >({});
  const [hydratingArticleLinks, setHydratingArticleLinks] = useState<
    Record<string, boolean>
  >({});
  const articleHydrationInFlightRef = useRef(new Set<string>());

  const scrollArticleIntoView = useCallback((articleKey: string) => {
    let el: HTMLElement | null = null;
    try {
      el = document.querySelector<HTMLElement>(
        `[data-article-key="${escapeArticleKey(articleKey)}"]`,
      );
    } catch {
      el = null;
    }

    if (!el) {
      for (const candidate of Array.from(document.getElementsByTagName("*"))) {
        if (
          candidate instanceof HTMLElement &&
          candidate.getAttribute("data-article-key") === articleKey
        ) {
          el = candidate;
          break;
        }
      }
    }

    el?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }, []);

  const hydrateArticleContent = useCallback(
    async (article: Article) => {
      const link = article.link?.trim();
      if (!link || !isValidUrl(link)) return;
      if (hydratedArticleLinks[link]) return;
      if (articleHydrationInFlightRef.current.has(link)) return;

      articleHydrationInFlightRef.current.add(link);
      setHydratingArticleLinks((current) => ({ ...current, [link]: true }));

      try {
        const extractedContent =
          await ArticleService.extractArticleContent(link);

        if (!extractedContent) {
          setHydratedArticleLinks((current) => {
            if (!current[link]) return current;
            const { [link]: _, ...rest } = current;
            return rest;
          });
          return;
        }

        setFeed((currentFeed) =>
          currentFeed.map((a) => {
            if (a.link.trim() !== link) return a;
            return { ...a, content: extractedContent };
          }),
        );

        setHydratedArticleLinks((current) => ({ ...current, [link]: true }));
      } catch (error) {
        console.error("Article hydration error:", error);
        setHydratedArticleLinks((current) => {
          if (!current[link]) return current;
          const { [link]: _, ...rest } = current;
          return rest;
        });
      } finally {
        articleHydrationInFlightRef.current.delete(link);
        setHydratingArticleLinks((current) => {
          if (!current[link]) return current;
          const { [link]: _, ...rest } = current;
          return rest;
        });
      }
    },
    [hydratedArticleLinks, setFeed],
  );

  return {
    hydratedArticleLinks,
    hydratingArticleLinks,
    scrollArticleIntoView,
    hydrateArticleContent,
  };
}
