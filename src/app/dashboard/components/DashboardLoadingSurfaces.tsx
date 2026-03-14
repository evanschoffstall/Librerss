import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

interface DashboardSurfaceSkeletonProps {
  children: React.ReactNode;
  containerClassName: string;
  surfaceClassName?: string;
}

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
    <DashboardSurfaceSkeleton containerClassName="relative mx-auto grid w-full max-w-3xl grid-cols-1 gap-1.5 px-1 lg:max-w-none lg:px-3">
      {ARTICLE_SKELETON_CARDS.map((descriptor, index) => (
        <DashboardArticleCardSkeleton descriptor={descriptor} key={index} />
      ))}
    </DashboardSurfaceSkeleton>
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
    <div className="space-y-2 px-2 anim-fade-in-load-slow">
      {SIDEBAR_SKELETON_GROUPS.map((group, groupIndex) => (
        <div
          className="space-y-0.5 opacity-100 transition-opacity anim-duration-ui anim-ease-ui"
          key={groupIndex}
          style={{
            animationDelay: `${groupIndex * 35}ms`,
            transitionDelay: `${groupIndex * 35}ms`,
          }}
        >
          <div className="px-1.5">
            <div className="w-full rounded px-1.5 py-1">
              <Skeleton className={cn("h-3 rounded-full", group.labelWidth)} />
            </div>
          </div>
          {group.feedRows.map((feedRow, feedRowIndex) => (
            <DashboardSidebarFeedRowSkeleton
              descriptor={feedRow}
              key={`${groupIndex}-${feedRowIndex}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Shared top-bar loading skeleton aligned with the dashboard filter strip. */
export function DashboardTopBarSkeleton() {
  return (
    <DashboardSurfaceSkeleton
      containerClassName="w-full px-2 lg:px-4"
      surfaceClassName="rounded-xl"
    >
      <Skeleton className="h-10 rounded-xl" />
    </DashboardSurfaceSkeleton>
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
        className="article-swipe-surface group relative overflow-visible rounded-xl border border-border dark:shadow-2xl dark:shadow-zinc-900/50"
      >
        <div className="relative rounded-t-xl bg-card/70 px-3 pt-3">
          <div className="space-y-2">
            <div className="flex select-none items-center gap-2 text-xs leading-5 tracking-normal text-muted-foreground/70">
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
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

              <div className="-mr-1 ml-auto flex shrink-0 items-center gap-1 opacity-100 transition-opacity duration-150">
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
        "flex w-full items-center justify-between gap-2 rounded-lg border-l-2 px-2 py-2 text-left transition-colors",
        descriptor.isActive
          ? "border-primary/60 bg-muted/70 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
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

/** Renders a single shared skeleton block within a dashboard surface wrapper. */
function DashboardSurfaceSkeleton({
  children,
  containerClassName,
  surfaceClassName,
}: DashboardSurfaceSkeletonProps) {
  return (
    <div className={containerClassName}>
      {surfaceClassName ? (
        <div className={cn("w-full", surfaceClassName)}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
