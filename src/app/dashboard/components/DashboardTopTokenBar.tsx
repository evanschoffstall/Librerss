"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { memo } from "react";
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

export const DashboardTopTokenBar = memo(function DashboardTopTokenBar({
  articleFilter,
  onArticleFilterChange,
  lastRefreshLabel,
  loading,
}: DashboardTopTokenBarProps) {
  return (
    <div className="sticky top-0 z-40 shrink-0 py-1">
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
                    className={`cursor-pointer rounded-full px-2.5 py-0.5 text-xs capitalize transition-colors ${
                      articleFilter === value
                        ? "bg-muted font-semibold text-foreground ring-1 ring-inset ring-border/40"
                        : "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {value}
                  </button>
                ))}

                <span
                  className="ml-auto flex select-none items-center gap-1.5 whitespace-nowrap text-right text-[11px] text-muted-foreground/50"
                  aria-live="polite"
                >
                  <RefreshCw className="size-2.5 shrink-0" />
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
});
