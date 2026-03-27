"use client";

import { RefreshCw } from "lucide-react";
import { memo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  ARTICLE_FILTER_OPTIONS,
  type ArticleFilter,
} from "../services/article-filters";
import { MotionSpinner } from "./MotionSpinner";

const FILTER_BAR_SKELETON_WIDTHS = ["w-8", "w-12", "w-9", "w-14"];

/** Presentation props for the dashboard filter bar controls and refresh status. */
interface DashboardFilterBarProps {
  articleFilter: ArticleFilter;
  lastRefreshLabel: string;
  loading: boolean;
  onArticleFilterChange: (value: ArticleFilter) => void;
}

/** Loading skeleton aligned with the dashboard filter strip. */
export function DashboardFilterBarSkeleton() {
  return (
    <div
      className="sticky top-0 z-40 shrink-0 py-1"
      data-dashboard-filter-bar-skeleton="true"
    >
      <div className="flex items-center gap-0">
        <div
          className="
            hidden
            lg:block lg:w-[220px] lg:shrink-0
          "
        />
        <div
          className="
            flex-1
            lg:min-w-0
          "
        >
          <div
            className="
              mx-auto w-full max-w-3xl px-2
              lg:max-w-none lg:px-4
            "
            data-dashboard-filter-bar-surface="true"
          >
            <div
              className="
                rounded-xl border border-border/60 bg-card/75 px-2
                backdrop-blur-sm
              "
            >
              <div className="flex min-h-8 items-center gap-2">
                {FILTER_BAR_SKELETON_WIDTHS.map((widthClassName) => (
                  <Skeleton
                    className={cn("h-5 rounded-full", widthClassName)}
                    data-dashboard-filter-bar-chip-skeleton="true"
                    key={widthClassName}
                  />
                ))}

                <span
                  aria-live="polite"
                  className="
                    ml-auto flex items-center gap-1.5 text-right text-[11px]
                    whitespace-nowrap text-muted-foreground/50 select-none
                  "
                >
                  <Skeleton className="size-2.5 rounded-full" />
                  <Skeleton
                    aria-label="Refreshing"
                    className="
                      inline-block h-[11px] w-12 rounded-sm align-middle
                    "
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Renders the quick article filter strip and refresh status indicator. */
export const DashboardFilterBar = memo(function DashboardFilterBar({
  articleFilter,
  lastRefreshLabel,
  loading,
  onArticleFilterChange,
}: DashboardFilterBarProps) {
  return (
    <div className="sticky top-0 z-40 shrink-0 py-1">
      <div className="flex items-center gap-0">
        <div
          className="
            hidden
            lg:block lg:w-[220px] lg:shrink-0
          "
        />
        <div
          className="
            flex-1
            lg:min-w-0
          "
        >
          <div
            className="
              mx-auto w-full max-w-3xl px-2
              lg:max-w-none lg:px-4
            "
            data-dashboard-width-link="feed"
          >
            <div
              className="
                rounded-xl border border-border/60 bg-card/75 px-2
                backdrop-blur-sm
              "
            >
              <div className="flex min-h-8 items-center gap-2">
                {ARTICLE_FILTER_OPTIONS.map((value) => (
                  <button
                    aria-pressed={articleFilter === value}
                    className={`
                      cursor-pointer rounded-full px-2.5 py-0.5 text-xs
                      capitalize transition-colors
                      ${
                        articleFilter === value
                          ? `
                            bg-muted font-semibold text-foreground ring-1
                            ring-border/40 ring-inset
                          `
                          : `
                            text-muted-foreground/70
                            hover:bg-muted/50 hover:text-foreground
                          `
                      }
                    `}
                    key={value}
                    onClick={() => {
                      onArticleFilterChange(value);
                    }}
                    type="button"
                  >
                    {value}
                  </button>
                ))}

                <span
                  aria-live="polite"
                  className="
                    ml-auto flex items-center gap-1.5 text-right text-[11px]
                    whitespace-nowrap text-muted-foreground/50 select-none
                  "
                >
                  {loading ? (
                    <MotionSpinner iconClassName="size-2.5" />
                  ) : (
                    <span className="inline-flex shrink-0">
                      <RefreshCw className="size-2.5 shrink-0" />
                    </span>
                  )}
                  {loading ? (
                    <Skeleton
                      aria-label="Refreshing"
                      className="
                        inline-block h-[11px] w-12 rounded-sm align-middle
                      "
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