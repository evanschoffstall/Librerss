"use client";

import { ArticleService, isValidUrl, type Article } from "@/lib";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

interface UseArticleHydrationOptions {
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
}

interface HydrateArticleContentOptions {
  force?: boolean;
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
  const articleHydrationInFlightRef = useRef(new Map<string, number>());

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
    async (article: Article, options?: HydrateArticleContentOptions) => {
      const forceHydration = options?.force ?? false;
      const link = article.link?.trim();
      if (!link || !isValidUrl(link)) return;
      const inFlightCount = articleHydrationInFlightRef.current.get(link) ?? 0;

      if (!forceHydration && hydratedArticleLinks[link]) return;
      if (!forceHydration && inFlightCount > 0) return;

      articleHydrationInFlightRef.current.set(link, inFlightCount + 1);
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
        toast.error("Unable to extract article content right now.");
      } finally {
        const remainingInFlight =
          (articleHydrationInFlightRef.current.get(link) ?? 1) - 1;

        if (remainingInFlight <= 0) {
          articleHydrationInFlightRef.current.delete(link);
          setHydratingArticleLinks((current) => {
            if (!current[link]) return current;
            const { [link]: _, ...rest } = current;
            return rest;
          });
        } else {
          articleHydrationInFlightRef.current.set(link, remainingInFlight);
        }
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
