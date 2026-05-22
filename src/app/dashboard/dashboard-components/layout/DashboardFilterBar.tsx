"use client";

import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  RefreshCw,
} from "lucide-react";
import { memo } from "react";

import { useDashboardShellHandoff } from "@/app/dashboard/dashboard-components";
import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import {
  ARTICLE_FILTER_OPTIONS,
  ARTICLE_SORT_ORDER_OPTIONS,
  type ArticleFilter,
  type ArticleSortOrder,
} from "@/app/dashboard/dashboard-services/article";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { DASHBOARD_FEED_SURFACE_CLASS_NAME } from "./DashboardScaffold";

/**
 * Skeleton widths for the filter chip placeholders (4 filter chips + 1 sort
 * order chip). Each value is a Tailwind width class.
 */
const FILTER_BAR_SKELETON_WIDTHS = [
  "w-[34px]",
  "w-[60px]",
  "w-[46px]",
  "w-[58px]",
  "w-[71px]",
];

/** Shared loaded and skeleton surface treatment for the token toolbar shell. */
const FILTER_BAR_SURFACE_CLASS_NAME = `
  flex h-8 w-full min-w-0 items-center overflow-hidden rounded-full border
  border-border bg-card/70 px-2.5
  dark:shadow-2xl dark:shadow-zinc-900/50
`;

/** Width owner that makes the token toolbar scale with the article cards. */
const FILTER_BAR_WIDTH_CLASS_NAME = DASHBOARD_FEED_SURFACE_CLASS_NAME;

/**
 * Describes the props for the dashboard filter bar frame component.
 */
interface DashboardFilterBarFrameProps {
  children: React.ReactNode;
  skeleton?: boolean;
}

/** Presentation props for the dashboard filter bar controls and refresh status. */
interface DashboardFilterBarProps {
  articleFilter: ArticleFilter;
  /** Current display sort order; defaults to `"newest"` when omitted. */
  articleSortOrder?: ArticleSortOrder;
  isSearchPending?: boolean;
  isShellLoading?: boolean;
  lastRefreshLabel: string;
  loading: boolean;
  onArticleFilterChange: (value: ArticleFilter) => void;
  /** Callback invoked when the user toggles the sort order. */
  onArticleSortOrderChange?: (value: ArticleSortOrder) => void;
}

/**
 * Render the dashboard filter bar skeleton component.
 * @returns The rendered dashboard filter bar skeleton component.
 */
export function DashboardFilterBarSkeleton() {
  return (
    <DashboardFilterBarFrame skeleton>
      <div className="flex items-center gap-0">
        <div
          className="
            hidden
            lg:block lg:w-[220px] lg:shrink-0
          "
        />
        <div className="flex-1 lg:min-w-0">
          <div
            className={FILTER_BAR_WIDTH_CLASS_NAME}
            data-dashboard-width-link="feed"
          >
            <div
              className={FILTER_BAR_SURFACE_CLASS_NAME}
              data-dashboard-filter-bar-surface="true"
            >
              <div className="flex size-full items-center gap-2">
                {FILTER_BAR_SKELETON_WIDTHS.map((widthClassName, index) => (
                  <div className="contents" key={widthClassName}>
                    {index === FILTER_BAR_SKELETON_WIDTHS.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-px shrink-0 bg-border/50"
                      />
                    ) : null}
                    <Skeleton
                      className={cn("h-5 rounded-full", widthClassName)}
                      data-dashboard-filter-bar-chip-skeleton="true"
                    />
                  </div>
                ))}

                <span
                  aria-live="polite"
                  className="
                    ml-auto flex items-center gap-1.5 text-right text-[11px]
                    whitespace-nowrap text-muted-foreground/50 select-none
                  "
                  data-dashboard-filter-bar-status="true"
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
    </DashboardFilterBarFrame>
  );
}

/**
 * Render the dashboard filter bar frame component.
 * @param props - The component props.
 * @returns The rendered dashboard filter bar frame component.
 */
function DashboardFilterBarFrame(props: DashboardFilterBarFrameProps) {
  const { children, skeleton = false } = props;
  return (
    <div
      className="sticky top-0 z-40 shrink-0 py-1"
      data-dashboard-filter-bar-root="true"
      data-dashboard-filter-bar-skeleton={skeleton ? "true" : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Return the next sort order toggled from the current one: `"newest"` ↔
 * `"oldest"`. Cycles through all values in {@link ARTICLE_SORT_ORDER_OPTIONS}
 * so future additions to the constant are handled automatically.
 * @param current - The current sort order.
 * @returns The next sort order in the cycle.
 */
function getNextSortOrder(current: ArticleSortOrder): ArticleSortOrder {
  const index = ARTICLE_SORT_ORDER_OPTIONS.indexOf(current);
  return ARTICLE_SORT_ORDER_OPTIONS[
    (index + 1) % ARTICLE_SORT_ORDER_OPTIONS.length
  ];
}

/** Maps each sort order to a human-readable label shown on the toggle button. */
const SORT_ORDER_LABEL: Record<ArticleSortOrder, string> = {
  newest: "Newest",
  oldest: "Oldest",
};

/** Renders the quick article filter strip and refresh status indicator. */
export const DashboardFilterBar = memo(
  /**
   * Render the dashboard filter bar component.
   * @param props - The component props.
   * @returns The rendered dashboard filter bar component.
   */
  function DashboardFilterBar(props: DashboardFilterBarProps) {
    const {
      articleFilter,
      articleSortOrder = "newest",
      isSearchPending = false,
      isShellLoading = false,
      lastRefreshLabel,
      loading,
      onArticleFilterChange,
      onArticleSortOrderChange,
    } = props;
    const handoff = useDashboardShellHandoff(isShellLoading);

    if (!handoff.shouldRenderHydratedContent) {
      return <DashboardFilterBarSkeleton />;
    }

    /** Show the spinner/skeleton while loading OR while a search is pending. */
    const showLoadingIndicator = loading || isSearchPending;
    const isOldestFirst = articleSortOrder === "oldest";
    const SortIcon = isOldestFirst ? ArrowUpNarrowWide : ArrowDownNarrowWide;

    const filterBarContent = (
      <DashboardFilterBarFrame>
        <div className="flex items-center gap-0">
          <div
            className="
            hidden
            lg:block lg:w-[220px] lg:shrink-0
          "
          />
          <div className="flex-1 lg:min-w-0">
            <div
              className={FILTER_BAR_WIDTH_CLASS_NAME}
              data-dashboard-width-link="feed"
            >
              <div
                className={FILTER_BAR_SURFACE_CLASS_NAME}
                data-dashboard-filter-bar-surface="true"
              >
                <div className="flex size-full min-w-0 items-center gap-2">
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

                  {/* Sort order toggle — separated from filter chips by a thin
                      divider so it is visually distinct but spatially close. */}
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-px shrink-0 bg-border/50"
                  />
                  <button
                    aria-label={`Sort by date: ${SORT_ORDER_LABEL[articleSortOrder]}`}
                    aria-pressed={isOldestFirst}
                    className={cn(
                      "inline-flex shrink-0 cursor-pointer items-center gap-0 rounded-full px-2 py-0.5 text-xs transition-colors sm:gap-1",
                      isOldestFirst
                        ? "bg-muted font-semibold text-foreground ring-1 ring-border/40 ring-inset"
                        : "text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground",
                    )}
                    data-dashboard-filter-bar-sort-order={articleSortOrder}
                    onClick={() => {
                      onArticleSortOrderChange?.(
                        getNextSortOrder(articleSortOrder),
                      );
                    }}
                    title={`Toggle sort order (currently: ${SORT_ORDER_LABEL[articleSortOrder]})`}
                    type="button"
                  >
                    <SortIcon className="size-3 shrink-0" />
                    <span
                      className="hidden sm:inline"
                      data-dashboard-filter-bar-sort-label="true"
                    >
                      {SORT_ORDER_LABEL[articleSortOrder]}
                    </span>
                  </button>

                  <span
                    aria-live="polite"
                    className="
                    ml-auto flex items-center gap-1.5 text-right text-[11px]
                    whitespace-nowrap text-muted-foreground/50 select-none
                  "
                    data-dashboard-filter-bar-status="true"
                  >
                    {showLoadingIndicator ? (
                      <MotionSpinner iconClassName="size-2.5" />
                    ) : (
                      <span className="inline-flex shrink-0">
                        <RefreshCw className="size-2.5 shrink-0" />
                      </span>
                    )}
                    {showLoadingIndicator ? (
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
      </DashboardFilterBarFrame>
    );

    if (handoff.shouldRenderSkeletonBackdrop) {
      return (
        <div
          className="relative shrink-0"
          data-dashboard-shell-handoff="filter-bar"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-0"
          >
            <DashboardFilterBarSkeleton />
          </div>
          <div
            className="relative z-10"
            data-dashboard-shell-handoff-content="filter-bar"
            style={handoff.contentStyle}
          >
            {filterBarContent}
          </div>
        </div>
      );
    }

    return filterBarContent;
  },
);
