"use client";

import { Loader2, SearchX, Sparkles } from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { EXIT_CLEANUP_MS, useAnimatedList } from "../../hooks/useAnimatedList";
import { getArticleKey } from "../../services/article-collection";
import { ArticleCard } from "../ArticleCard";

import { Skeleton } from "@/components/ui/skeleton";
import { type Article } from "@/lib";

interface FeedListProps {
  expandedArticleKey: null | string;
  filteredFeed: Article[];
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  loading: boolean;
  onExpandedSwipeRead: (article: Article) => void;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  searchTerm: string;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
  visibleCount: number;
}

const ArticleCardSkeleton = memo(function ArticleCardSkeleton() {
  return (
    <article className="group relative overflow-visible rounded-xl border border-border dark:shadow-2xl dark:shadow-zinc-900/50">
      <div className="relative rounded-t-xl bg-card/70 px-3 pt-3">
        <div className="relative z-10 space-y-2">
          <div className="flex select-none items-center gap-2 text-xs leading-5 tracking-normal text-muted-foreground/70">
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-1 rounded-full" />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="size-3 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="-mr-1 ml-auto flex shrink-0 items-center gap-1">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="size-6 rounded-md" />
            </div>
          </div>
          <div className="space-y-1">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
      <div className="relative rounded-b-xl bg-card/70 px-3 pb-3 pt-2">
        <div className="relative z-10 py-0.5">
          <Skeleton className="h-4 w-[86%]" />
        </div>
      </div>
    </article>
  );
});

export const FeedList = memo(function FeedList({
  expandedArticleKey,
  filteredFeed,
  hydratedArticleLinks,
  hydratingArticleLinks,
  loading,
  onExpandedSwipeRead,
  onToggle,
  onToggleRead,
  onToggleStarred,
  searchTerm,
  sentinelRef,
  showFavicons,
  updatingArticleState,
  visibleCount,
}: FeedListProps) {
  const visibleFeed = useMemo(
    () => filteredFeed.slice(0, visibleCount),
    [filteredFeed, visibleCount],
  );
  const animatedItems = useAnimatedList(visibleFeed, getArticleKey, 12);
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
          className="relative mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 px-1 lg:max-w-none lg:px-3 anim-fade-in-load-slow"
          key="feed-loading"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <ArticleCardSkeleton key={index} />
          ))}
        </div>
      ) : !hasAnyVisible && filteredFeed.length === 0 ? (
        <div
          className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-20 sm:py-32 lg:max-w-none lg:px-6 lg:py-40 anim-fade-in-load-slow"
          key="feed-empty"
        >
          <div
            className="flex flex-col items-center gap-6 text-center anim-fade-in-load-slow"
            key={searchTerm ? "empty-search" : "empty-default"}
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
              {searchTerm ? (
                <div className="flex flex-col items-center gap-0.5 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                  <span>Nothing matched</span>
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80 max-w-full truncate">
                    {searchTerm}
                  </span>
                  <span>Try a different term.</span>
                </div>
              ) : (
                <p className="max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                  Check back later or pull for fresh articles.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 px-1 lg:max-w-none lg:px-3"
          key="feed-list"
        >
          {animatedItems.map(({ exiting, item: article, key: cardKey }) => {
            const articleLink = article.link.trim();
            return (
              <div
                className={
                  exiting
                    ? "article-exit pointer-events-none overflow-hidden"
                    : undefined
                }
                key={cardKey}
                ref={exiting ? exitRef : undefined}
              >
                <ArticleCard
                  article={article}
                  articleKey={cardKey}
                  hasScrapedContent={hydratedArticleLinks[articleLink]}
                  isExpanded={expandedArticleKey === cardKey}
                  isHydrating={hydratingArticleLinks[articleLink]}
                  isUpdatingState={updatingArticleState[cardKey]}
                  onExpandedSwipeRead={onExpandedSwipeRead}
                  onToggle={onToggle}
                  onToggleRead={onToggleRead}
                  onToggleStarred={onToggleStarred}
                  showFavicon={showFavicons}
                  useRichFormatting={hydratedArticleLinks[articleLink]}
                />
              </div>
            );
          })}
          <div
            className="py-1 flex justify-center"
            ref={sentinelRef}
            style={{ overflowAnchor: "none" }}
          >
            {visibleCount < filteredFeed.length && (
              <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
            )}
          </div>
        </div>
      )}
    </>
  );
});
