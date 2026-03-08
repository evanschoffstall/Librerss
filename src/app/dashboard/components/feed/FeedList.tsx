"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { type Article } from "@/lib";
import { Loader2, SearchX, Sparkles } from "lucide-react";
import { useCallback, useMemo } from "react";
import { EXIT_CLEANUP_MS, useAnimatedList } from "../../hooks/useAnimatedList";
import { getArticleKey } from "../../services/article-collection";
import { ArticleCard } from "../ArticleCard";

interface FeedListProps {
  loading: boolean;
  filteredFeed: Article[];
  visibleCount: number;
  expandedArticleKey: string | null;
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  updatingArticleState: Record<string, boolean>;
  showFavicons: boolean;
  searchTerm: string;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
}

export function FeedList({
  loading,
  filteredFeed,
  visibleCount,
  expandedArticleKey,
  hydratedArticleLinks,
  hydratingArticleLinks,
  updatingArticleState,
  showFavicons,
  searchTerm,
  sentinelRef,
  onToggle,
  onToggleRead,
  onToggleStarred,
}: FeedListProps) {
  const visibleFeed = useMemo(
    () => filteredFeed.slice(0, visibleCount),
    [filteredFeed, visibleCount],
  );
  const animatedItems = useAnimatedList(visibleFeed, getArticleKey);
  const hasAnyVisible = animatedItems.length > 0;

  const exitRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const rect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(parent).rowGap) || 0;
    const offset = rect.height + gap;

    // Collect siblings after the exiting element
    const siblings: HTMLElement[] = [];
    let found = false;
    for (const child of parent.children) {
      if (child === el) {
        found = true;
        continue;
      }
      if (found && child instanceof HTMLElement) siblings.push(child);
    }

    // FLIP: pre-apply inverse translateY so siblings stay visually in place
    // when the exiting element leaves flow
    for (const sib of siblings) sib.style.transform = `translateY(${offset}px)`;

    // Take exiting element out of grid flow
    el.style.position = "absolute";
    el.style.top = `${rect.top - parentRect.top + parent.scrollTop}px`;
    el.style.left = "0";
    el.style.right = "0";
    el.style.height = `${rect.height}px`;
    el.style.zIndex = "10";

    // Force layout so positions are applied before animation frame
    void el.offsetHeight;

    // Animate: only transform + opacity (GPU-composited, no layout reflow)
    requestAnimationFrame(() => {
      el.style.transition = "opacity 180ms ease-out, transform 180ms ease-out";
      el.style.opacity = "0";
      el.style.transform = "scale(0.97) translateX(16px)";

      for (const sib of siblings) {
        sib.style.transition = "transform 280ms cubic-bezier(0.25,0.1,0.25,1)";
        sib.style.transform = "translateY(0)";
      }
    });

    // Clean up inline styles after animation completes
    setTimeout(() => {
      for (const sib of siblings) {
        sib.style.transform = "";
        sib.style.transition = "";
      }
    }, EXIT_CLEANUP_MS);
  }, []);

  return (
    <>
      {loading ? (
        <div
          key="feed-loading"
          className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 px-1 py-2 lg:max-w-none lg:px-3 anim-fade-in-load-slow"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border bg-card/40 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-3/4" />
              <div className="space-y-1.5 pt-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-[92%]" />
                <Skeleton className="h-3 w-[78%]" />
              </div>
            </div>
          ))}
        </div>
      ) : !hasAnyVisible && filteredFeed.length === 0 ? (
        <div
          key="feed-empty"
          className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-20 sm:py-32 lg:max-w-none lg:px-6 lg:py-40 anim-fade-in-load-slow"
        >
          <div
            key={searchTerm ? "empty-search" : "empty-default"}
            className="flex flex-col items-center gap-6 text-center anim-fade-in-load-slow"
          >
            {/* Icon with double-ring halo */}
            <div className="relative flex items-center justify-center">
              {/* Outer glow ring */}
              <div
                className={`absolute size-36 rounded-full blur-2xl opacity-15 ${searchTerm ? "bg-muted-foreground" : "bg-emerald-500"}`}
              />
              {/* Outer decorative ring */}
              <div
                className={`absolute size-28 rounded-full border ${searchTerm ? "border-border/40" : "border-emerald-500/10"}`}
              />
              {/* Icon card */}
              <div
                className={`relative flex size-20 items-center justify-center rounded-2xl border bg-card/70 shadow-md backdrop-blur-sm ${searchTerm ? "border-border" : "border-emerald-500/25"}`}
              >
                {searchTerm ? (
                  <SearchX
                    className="size-9 text-muted-foreground/55"
                    strokeWidth={1.25}
                  />
                ) : (
                  <Sparkles
                    className="size-9 text-emerald-500/70"
                    strokeWidth={1.25}
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                {searchTerm ? "No results" : "You\u2019re up to date"}
              </h3>
              <p className="max-w-[15rem] text-sm leading-relaxed text-muted-foreground">
                {searchTerm ? (
                  <>
                    Nothing matched{" "}
                    <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80">
                      {searchTerm}
                    </span>
                    . Try a different term.
                  </>
                ) : (
                  "Check back later or pull for fresh articles."
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          key="feed-list"
          className="relative mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 px-1 lg:max-w-none lg:px-3"
        >
          {animatedItems.map(({ item: article, key: cardKey, exiting }) => {
            const articleLink = article.link?.trim() ?? "";
            return (
              <div
                key={cardKey}
                ref={exiting ? exitRef : undefined}
                className={
                  exiting
                    ? "article-exit pointer-events-none overflow-hidden"
                    : undefined
                }
              >
                <ArticleCard
                  articleKey={cardKey}
                  article={article}
                  isExpanded={expandedArticleKey === cardKey}
                  useRichFormatting={Boolean(hydratedArticleLinks[articleLink])}
                  hasScrapedContent={Boolean(hydratedArticleLinks[articleLink])}
                  isHydrating={Boolean(hydratingArticleLinks[articleLink])}
                  isUpdatingState={Boolean(updatingArticleState[cardKey])}
                  showFavicon={showFavicons}
                  onToggle={() => onToggle(article)}
                  onToggleRead={() => onToggleRead(article)}
                  onToggleStarred={() => onToggleStarred(article)}
                />
              </div>
            );
          })}
          <div ref={sentinelRef} className="py-1 flex justify-center">
            {visibleCount < filteredFeed.length && (
              <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
