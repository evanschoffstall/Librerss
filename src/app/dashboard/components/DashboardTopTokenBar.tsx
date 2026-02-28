"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  ARTICLE_FILTER_OPTIONS,
  type ArticleFilter,
} from "../services/article-filters";

type DashboardTopTokenBarProps = {
  articleFilter: ArticleFilter;
  onArticleFilterChange: (value: ArticleFilter) => void;
  lastRefreshLabel: string;
  loading: boolean;
};

export function DashboardTopTokenBar({
  articleFilter,
  onArticleFilterChange,
  lastRefreshLabel,
  loading,
}: DashboardTopTokenBarProps) {
  return (
    <div className="sticky z-40 shrink-0 py-1">
      <div className="flex items-center gap-0">
        <div className="hidden lg:block lg:w-[220px] lg:shrink-0" />
        <div className="flex-1 lg:min-w-0">
          <div className="mx-auto w-full max-w-3xl px-2 lg:max-w-none lg:px-4">
            <div className="rounded-xl border border-border/60 bg-card/75 px-2 backdrop-blur-sm">
              <div className="flex min-h-8 items-center gap-2">
                {ARTICLE_FILTER_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onArticleFilterChange(value)}
                    className={`rounded-full px-2.5 py-0.5 text-xs capitalize transition-colors ${
                      articleFilter === value
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {value}
                  </button>
                ))}

                <span
                  className="ml-auto whitespace-nowrap text-right text-[11px] text-muted-foreground/70"
                  aria-live="polite"
                >
                  Last refreshed:{" "}
                  {loading ? (
                    <Skeleton
                      className="inline-block h-[11px] w-12 rounded-sm align-middle"
                      aria-label="Refreshing"
                    />
                  ) : (
                    lastRefreshLabel
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
