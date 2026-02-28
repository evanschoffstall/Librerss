"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { type Article } from "@/lib";
import { Loader2 } from "lucide-react";
import { getArticleKey } from "../../services/article-collection";
import { ArticleCard } from "../ArticleCard";

const emptyActionBtnCls =
  "text-sm text-muted-foreground/70 underline underline-offset-2";

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
  onClearSearch: () => void;
  onRefresh: () => void;
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
  onClearSearch,
  onRefresh,
}: FeedListProps) {
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
      ) : filteredFeed.length === 0 ? (
        <div
          key="feed-empty"
          className="mx-auto flex w-full max-w-3xl items-center justify-center px-1 py-32 lg:max-w-none lg:px-3 anim-fade-in-load-slow"
        >
          <div className="text-center space-y-2">
            <p className="text-base text-muted-foreground">
              {searchTerm ? "No matches." : "You're all caught up!"}
            </p>
            {searchTerm ? (
              <button onClick={onClearSearch} className={emptyActionBtnCls}>
                Clear search
              </button>
            ) : (
              <button onClick={onRefresh} className={emptyActionBtnCls}>
                Refresh
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          key="feed-list"
          className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 px-1 lg:max-w-none lg:px-3"
        >
          {filteredFeed.slice(0, visibleCount).map((article) => {
            const cardKey = getArticleKey(article);
            const articleLink = article.link?.trim() ?? "";
            return (
              <div key={cardKey}>
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
