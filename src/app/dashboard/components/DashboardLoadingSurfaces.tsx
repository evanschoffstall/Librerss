"use client";

import { motion } from "motion/react";

import { FEED_PULL_HEIGHT } from "../hooks/useFeedSurface";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SKELETON_REVEAL_TRANSITION = {
  duration: 0.26,
  ease: [0.16, 1, 0.3, 1] as const,
};

interface DashboardArticleSkeletonDescriptor {
  bodyWidths: [string, string];
  metaSourceWidth: string;
  titleWidths: [string, string];
}

interface DashboardSidebarSkeletonGroupDescriptor {
  feedRows: DashboardSidebarSkeletonRowDescriptor[];
  labelWidth: string;
}

interface DashboardSidebarSkeletonRowDescriptor {
  hostWidth: string;
  isActive: boolean;
  labelWidth: string;
}

const TOP_BAR_FILTER_SKELETON_WIDTHS = ["w-8", "w-12", "w-9", "w-14"];

const ARTICLE_SKELETON_CARDS: DashboardArticleSkeletonDescriptor[] = [
  {
    bodyWidths: ["w-full", "w-[82%]"],
    metaSourceWidth: "w-24",
    titleWidths: ["w-[88%]", "w-[56%]"],
  },
  {
    bodyWidths: ["w-[94%]", "w-[72%]"],
    metaSourceWidth: "w-28",
    titleWidths: ["w-[92%]", "w-[68%]"],
  },
  {
    bodyWidths: ["w-[90%]", "w-[76%]"],
    metaSourceWidth: "w-20",
    titleWidths: ["w-[84%]", "w-[61%]"],
  },
  {
    bodyWidths: ["w-[96%]", "w-[70%]"],
    metaSourceWidth: "w-26",
    titleWidths: ["w-[90%]", "w-[58%]"],
  },
];

const SIDEBAR_SKELETON_GROUPS: DashboardSidebarSkeletonGroupDescriptor[] = [
  {
    feedRows: [
      {
        hostWidth: "w-[62%]",
        isActive: true,
        labelWidth: "w-[72%]",
      },
      {
        hostWidth: "w-[54%]",
        isActive: false,
        labelWidth: "w-[68%]",
      },
    ],
    labelWidth: "w-18",
  },
  {
    feedRows: [
      {
        hostWidth: "w-[66%]",
        isActive: false,
        labelWidth: "w-[76%]",
      },
      {
        hostWidth: "w-[58%]",
        isActive: false,
        labelWidth: "w-[64%]",
      },
      {
        hostWidth: "w-[70%]",
        isActive: false,
        labelWidth: "w-[82%]",
      },
    ],
    labelWidth: "w-24",
  },
  {
    feedRows: [
      {
        hostWidth: "w-[57%]",
        isActive: false,
        labelWidth: "w-[66%]",
      },
    ],
    labelWidth: "w-16",
  },
];

/**
 * Shared article-list loading surface used by both the route shell and live feed.
 *
 * The placeholder cards intentionally mirror the collapsed article-card DOM so the
 * first hydrated frame does not shift wrapper spacing, header rails, or preview
 * rhythm when real articles replace the skeletons.
 */
export function DashboardFeedListSkeleton() {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="
        relative mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 px-1
        lg:max-w-none lg:px-3
      "
      initial={{ opacity: 0, y: 10 }}
      transition={SKELETON_REVEAL_TRANSITION}
    >
      {ARTICLE_SKELETON_CARDS.map((descriptor, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 8 }}
          key={index}
          transition={{
            ...SKELETON_REVEAL_TRANSITION,
            delay: index * 0.035,
          }}
        >
          <DashboardArticleCardSkeleton descriptor={descriptor} />
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Shared inert pull-sentinel spacer so the shell matches the live feed viewport. */
export function DashboardPullSentinelSkeleton() {
  return (
    <div
      className="mb-2 flex items-end justify-center bg-background"
      data-dashboard-pull-sentinel-skeleton="true"
      style={{ height: FEED_PULL_HEIGHT }}
    />
  );
}

/**
 * Shared sidebar loading surface used by both the route shell and live sidebar.
 *
 * The skeleton keeps the same group, header, and feed-row wrappers as the real
 * sidebar so category hydration does not visibly reflow the column.
 */
export function DashboardSidebarSkeleton() {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2 px-2"
      initial={{ opacity: 0, y: 8 }}
      transition={SKELETON_REVEAL_TRANSITION}
    >
      {SIDEBAR_SKELETON_GROUPS.map((group, groupIndex) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="space-y-0.5"
          initial={{ opacity: 0, y: 6 }}
          key={groupIndex}
          transition={{
            ...SKELETON_REVEAL_TRANSITION,
            delay: groupIndex * 0.035,
          }}
        >
          <div className="px-1.5">
            <div className="w-full rounded-sm px-1.5 py-1">
              <Skeleton className={cn("h-3 rounded-full", group.labelWidth)} />
            </div>
          </div>
          {group.feedRows.map((feedRow, feedRowIndex) => (
            <DashboardSidebarFeedRowSkeleton
              descriptor={feedRow}
              key={`${groupIndex}-${feedRowIndex}`}
            />
          ))}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** Shared top-bar loading skeleton aligned with the dashboard filter strip. */
export function DashboardTopBarSkeleton() {
  return (
    <div
      className="sticky top-0 z-40 shrink-0 py-1"
      data-dashboard-top-bar-skeleton="true"
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
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="
              mx-auto w-full max-w-3xl px-2
              lg:max-w-none lg:px-4
            "
            initial={{ opacity: 0, y: 8 }}
            transition={SKELETON_REVEAL_TRANSITION}
          >
            <div
              className="
                rounded-xl border border-border/60 bg-card/75 px-2
                backdrop-blur-sm
              "
            >
              <div className="flex min-h-8 items-center gap-2">
                {TOP_BAR_FILTER_SKELETON_WIDTHS.map((widthClassName) => (
                  <Skeleton
                    className={cn("h-5 rounded-full", widthClassName)}
                    data-dashboard-top-bar-filter-skeleton="true"
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
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Renders a collapsed article-card shell with the same header/body anatomy. */
function DashboardArticleCardSkeleton({
  descriptor,
}: {
  descriptor: DashboardArticleSkeletonDescriptor;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl"
      data-dashboard-article-skeleton="true"
    >
      <article
        aria-hidden="true"
        className="
          article-swipe-surface group relative overflow-visible rounded-xl
          border border-border
          dark:shadow-2xl dark:shadow-zinc-900/50
        "
      >
        <div className="relative rounded-t-xl bg-card/70 px-3 pt-3">
          <div className="space-y-2">
            <div
              className="
                flex items-center gap-2 text-xs/5 tracking-normal
                text-muted-foreground/70 select-none
              "
            >
              <div
                className="flex shrink-0 items-center gap-2 whitespace-nowrap"
              >
                <Skeleton className="size-3 rounded-full" />
                <Skeleton className="h-3 w-16 rounded-full" />
                <Skeleton className="size-1 shrink-0 rounded-full" />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="size-3 rounded-sm" />
                <Skeleton
                  className={cn("h-3 rounded-full", descriptor.metaSourceWidth)}
                />
              </div>

              <div
                className="
                  -mr-1 ml-auto flex shrink-0 items-center gap-1 opacity-100
                  transition-opacity duration-150
                "
              >
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
              </div>
            </div>

            <div className="space-y-2 pb-0.5">
              <Skeleton
                className={cn("h-4 rounded-full", descriptor.titleWidths[0])}
              />
              <Skeleton
                className={cn("h-4 rounded-full", descriptor.titleWidths[1])}
              />
            </div>
          </div>
        </div>

        <div className="relative rounded-b-xl bg-card/70 px-3 pt-2 pb-3">
          <div className="space-y-2 py-1">
            <Skeleton
              className={cn("h-3 rounded-full", descriptor.bodyWidths[0])}
            />
            <Skeleton
              className={cn("h-3 rounded-full", descriptor.bodyWidths[1])}
            />
          </div>
        </div>
      </article>
    </div>
  );
}

/** Renders a single feed-row shell with the same active and layout affordances. */
function DashboardSidebarFeedRowSkeleton({
  descriptor,
}: {
  descriptor: DashboardSidebarSkeletonRowDescriptor;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        `
          flex w-full items-center justify-between gap-2 rounded-lg border-l-2
          p-2 text-left transition-colors
        `,
        descriptor.isActive
          ? "border-primary/60 bg-muted/70 text-foreground"
          : `
            border-transparent text-muted-foreground
            hover:bg-muted/40 hover:text-foreground
          `,
      )}
      data-dashboard-sidebar-skeleton-row="true"
    >
      <div className="min-w-0 flex-1">
        <Skeleton className={cn("h-3.5 rounded-full", descriptor.labelWidth)} />
        <Skeleton
          className={cn("mt-1 h-3 rounded-full", descriptor.hostWidth)}
        />
      </div>
      <Skeleton className="size-3.5 shrink-0 rounded-sm" />
    </div>
  );
}
