"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { type Article } from "@/lib";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { getArticleKey } from "../../helpers/helpers";
import { ArticleCard } from "../DashboardArticleCard";

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
  selectedCategory: string;
  selectedFeedUrl: string | undefined;
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
  selectedCategory,
  selectedFeedUrl,
  sentinelRef,
  onToggle,
  onToggleRead,
  onToggleStarred,
  onClearSearch,
  onRefresh,
}: FeedListProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.div
          key="feed-skeleton"
          className="grid grid-cols-1 gap-2 pr-3 py-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-xl border bg-card/40 p-3 space-y-2">
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
        </motion.div>
      ) : filteredFeed.length === 0 ? (
        <motion.div
          key="feed-empty"
          className="flex items-center justify-center py-32"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {searchTerm ? "No matches." : "No articles yet."}
            </p>
            {searchTerm ? (
              <button
                onClick={onClearSearch}
                className="text-xs text-muted-foreground/60 underline underline-offset-2"
              >
                Clear search
              </button>
            ) : (
              <button
                onClick={onRefresh}
                className="text-xs text-muted-foreground/60 underline underline-offset-2"
              >
                Refresh
              </button>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="feed-list"
          className="grid grid-cols-1 gap-2 pr-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {filteredFeed.slice(0, visibleCount).map((article) => {
            const cardKey = getArticleKey(article);
            return (
              <ArticleCard
                key={cardKey}
                articleKey={cardKey}
                article={article}
                isExpanded={expandedArticleKey === cardKey}
                useRichFormatting={Boolean(hydratedArticleLinks[cardKey])}
                isHydrating={Boolean(hydratingArticleLinks[cardKey])}
                isUpdatingState={Boolean(updatingArticleState[cardKey])}
                showFavicon={showFavicons}
                onToggle={() => onToggle(article)}
                onToggleRead={() => onToggleRead(article)}
                onToggleStarred={() => onToggleStarred(article)}
              />
            );
          })}
          <div ref={sentinelRef} className="py-1 flex justify-center">
            {visibleCount < filteredFeed.length && (
              <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
