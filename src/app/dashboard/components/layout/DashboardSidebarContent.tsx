import { Rss } from "lucide-react";
import { memo } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import { useDashboardShellHandoff } from "@/app/dashboard/components";
import { SidebarFeedCategory } from "@/app/dashboard/components/layout/SidebarFeedCategory";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Describes the props for the dashboard sidebar content component.
 */
interface DashboardSidebarContentProps {
  isCategoriesLoading: boolean;
  isSidebarVisible: boolean;
  onCategoryClick: (categoryNode: CategoryTreeNode) => void;
  onCategoryPrefetch: (categoryNode: CategoryTreeNode) => void;
  onFeedClick: (feedNode: CategoryTreeNode) => void;
  onFeedPrefetch: (feedNode: CategoryTreeNode) => void;
  selectedCategory: string;
  showFavicons: boolean;
  sidebarCategories: CategoryTreeNode[];
}

/**
 * Describes the sidebar skeleton group descriptor.
 */
interface SidebarSkeletonGroupDescriptor {
  feedRows: SidebarSkeletonRowDescriptor[];
  labelWidth: string;
}

/**
 * Describes the sidebar skeleton row descriptor.
 */
interface SidebarSkeletonRowDescriptor {
  bodyWidth: string;
  hostWidth: string;
  isActive: boolean;
  minHeightClassName: string;
}

const SIDEBAR_SKELETON_GROUPS: SidebarSkeletonGroupDescriptor[] = [
  {
    feedRows: [
      {
        bodyWidth: "w-[82%]",
        hostWidth: "w-[54%]",
        isActive: false,
        minHeightClassName: "min-h-[56px]",
      },
      {
        bodyWidth: "w-[86%]",
        hostWidth: "w-[50%]",
        isActive: false,
        minHeightClassName: "min-h-[76px]",
      },
    ],
    labelWidth: "w-30",
  },
  {
    feedRows: [
      {
        bodyWidth: "w-[70%]",
        hostWidth: "w-[48%]",
        isActive: false,
        minHeightClassName: "min-h-[56px]",
      },
      {
        bodyWidth: "w-[88%]",
        hostWidth: "w-[58%]",
        isActive: false,
        minHeightClassName: "min-h-[76px]",
      },
      {
        bodyWidth: "w-[68%]",
        hostWidth: "w-[52%]",
        isActive: false,
        minHeightClassName: "min-h-[56px]",
      },
    ],
    labelWidth: "w-24",
  },
  {
    feedRows: [
      {
        bodyWidth: "w-[80%]",
        hostWidth: "w-[46%]",
        isActive: false,
        minHeightClassName: "min-h-[56px]",
      },
    ],
    labelWidth: "w-16",
  },
];

/**
 * Describes the props for the sidebar category skeleton component.
 */
interface SidebarCategorySkeletonProps {
  /** Whether the skeleton should reserve the active category background. */
  isActive?: boolean;
  /** Width class used for the category label placeholder. */
  labelWidth: string;
}

/**
 * Describes the props for the sidebar feed row skeleton component.
 */
interface SidebarFeedRowSkeletonProps {
  descriptor: SidebarSkeletonRowDescriptor;
}

/**
 * Render the dashboard sidebar skeleton component.
 * @returns The rendered dashboard sidebar skeleton component.
 */
export function DashboardSidebarSkeleton() {
  return (
    <div className="space-y-2 px-2" data-dashboard-sidebar-skeleton="true">
      <SidebarCategorySkeleton isActive labelWidth="w-16" />
      {SIDEBAR_SKELETON_GROUPS.map((group, groupIndex) => (
        <div className="space-y-0.5" key={groupIndex}>
          <SidebarCategorySkeleton labelWidth={group.labelWidth} />
          {group.feedRows.map((feedRow, feedRowIndex) => (
            <SidebarFeedRowSkeleton
              descriptor={feedRow}
              key={`${groupIndex}-${feedRowIndex}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Render one sidebar category label skeleton with the same header footprint as
 * hydrated category selector buttons.
 * @param props - Category row display state and placeholder width.
 * @returns The rendered sidebar category skeleton.
 */
function SidebarCategorySkeleton(props: SidebarCategorySkeletonProps) {
  const { isActive = false, labelWidth } = props;
  return (
    <div className="px-1.5" data-dashboard-sidebar-skeleton-category="true">
      <div
        className={cn(
          "w-full rounded-sm px-1.5 py-1",
          isActive ? "bg-muted/60" : null,
        )}
      >
        <Skeleton className={cn("h-3 rounded-full", labelWidth)} />
      </div>
    </div>
  );
}

/**
 * Render the sidebar feed row skeleton component.
 * @param props - The component props.
 * @returns The rendered sidebar feed row skeleton component.
 */
function SidebarFeedRowSkeleton(props: SidebarFeedRowSkeletonProps) {
  const { descriptor } = props;
  return (
    <div
      aria-hidden="true"
      className={cn(
        `
          flex w-full items-center justify-between gap-2 rounded-lg border-l-2
          p-2 text-left transition-colors
        `,
        descriptor.minHeightClassName,
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
        <Skeleton className={cn("h-3.5 rounded-full", descriptor.bodyWidth)} />
        <Skeleton
          className={cn("mt-1 h-3 rounded-full", descriptor.hostWidth)}
        />
      </div>
      <Skeleton className="size-3.5 shrink-0 rounded-sm" />
    </div>
  );
}

export const DashboardSidebarContent = memo(
  /**
   * Render the dashboard sidebar content component.
   * @param props - The component props.
   * @returns The rendered dashboard sidebar content component.
   */
  function DashboardSidebarContent(props: DashboardSidebarContentProps) {
    const {
      isCategoriesLoading,
      onCategoryClick,
      onCategoryPrefetch,
      onFeedClick,
      onFeedPrefetch,
      selectedCategory,
      showFavicons,
      sidebarCategories,
    } = props;
    const handoff = useDashboardShellHandoff(isCategoriesLoading);

    if (!handoff.shouldRenderHydratedContent) {
      return <DashboardSidebarSkeleton />;
    }

    const sidebarContent = (
      <div
        className="space-y-2 px-2"
        data-dashboard-shell-handoff-content="sidebar"
        style={handoff.contentStyle}
      >
        {sidebarCategories.length === 0 ? (
          <div
            className="
              flex flex-col items-center gap-2.5 px-2 py-10 text-center
            "
          >
            <div
              className="
                flex size-9 items-center justify-center rounded-lg border
                border-border/30 bg-card/50
              "
            >
              <Rss
                className="size-4 text-muted-foreground/40"
                strokeWidth={1.5}
              />
            </div>
            <p className="text-xs text-muted-foreground/55">No feeds yet</p>
          </div>
        ) : (
          sidebarCategories.map((categoryNode: CategoryTreeNode) => (
            <div className="space-y-0.5" key={categoryNode.key}>
              <div className="px-1.5">
                <button
                  className={`
                    w-full cursor-pointer rounded-sm px-1.5 py-1 text-left
                    font-sans text-[0.65rem] font-semibold tracking-[0.07em]
                    uppercase transition-colors
                    ${
                      selectedCategory === categoryNode.key
                        ? "bg-muted/60 text-foreground"
                        : `
                          text-muted-foreground/65
                          hover:bg-muted/30 hover:text-foreground
                        `
                    }
                  `}
                  onClick={() => {
                    onCategoryClick(categoryNode);
                  }}
                  onFocus={() => {
                    onCategoryPrefetch(categoryNode);
                  }}
                  onMouseEnter={() => {
                    onCategoryPrefetch(categoryNode);
                  }}
                  type="button"
                >
                  {categoryNode.label}
                </button>
              </div>
              {(categoryNode.children ?? []).map(
                (feedNode: CategoryTreeNode) => (
                  <SidebarFeedCategory
                    category={feedNode}
                    isActive={selectedCategory === feedNode.key}
                    key={feedNode.key}
                    onClick={onFeedClick}
                    onPrefetch={onFeedPrefetch}
                    showFavicon={showFavicons}
                  />
                ),
              )}
            </div>
          ))
        )}
      </div>
    );

    if (handoff.shouldRenderSkeletonBackdrop) {
      return (
        <div className="relative" data-dashboard-shell-handoff="sidebar">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-0"
          >
            <DashboardSidebarSkeleton />
          </div>
          <div className="relative z-10">{sidebarContent}</div>
        </div>
      );
    }

    return sidebarContent;
  },
);
