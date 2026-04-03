import { Rss } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { type CategoryTreeNode } from "@/lib";
import { cn } from "@/lib/utils";

import { FeedCategory } from "./feed/FeedCategory";

const SIDEBAR_SECTION_TRANSITION = {
  duration: 0.24,
  ease: [0.16, 1, 0.3, 1] as const,
};

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

interface SidebarSkeletonGroupDescriptor {
  feedRows: SidebarSkeletonRowDescriptor[];
  labelWidth: string;
}

interface SidebarSkeletonRowDescriptor {
  hostWidth: string;
  isActive: boolean;
  labelWidth: string;
}

const SIDEBAR_SKELETON_GROUPS: SidebarSkeletonGroupDescriptor[] = [
  {
    feedRows: [
      { hostWidth: "w-[62%]", isActive: true, labelWidth: "w-[72%]" },
      { hostWidth: "w-[54%]", isActive: false, labelWidth: "w-[68%]" },
    ],
    labelWidth: "w-18",
  },
  {
    feedRows: [
      { hostWidth: "w-[66%]", isActive: false, labelWidth: "w-[76%]" },
      { hostWidth: "w-[58%]", isActive: false, labelWidth: "w-[64%]" },
      { hostWidth: "w-[70%]", isActive: false, labelWidth: "w-[82%]" },
    ],
    labelWidth: "w-24",
  },
  {
    feedRows: [
      { hostWidth: "w-[57%]", isActive: false, labelWidth: "w-[66%]" },
    ],
    labelWidth: "w-16",
  },
];

/**
 * Sidebar loading surface that mirrors the real category/feed-row structure.
 *
 * Co-located with the live sidebar content so the handoff is seamless — the
 * skeleton uses the same group, header, and feed-row wrappers, preventing
 * visible reflow when real categories mount.
 */
export function DashboardSidebarSkeleton() {
  return (
    <div
      className="space-y-2 px-2"
      data-dashboard-sidebar-skeleton="true"
    >
      {SIDEBAR_SKELETON_GROUPS.map((group, groupIndex) => (
        <div className="space-y-0.5" key={groupIndex}>
          <div className="px-1.5">
            <div className="w-full rounded-sm px-1.5 py-1">
              <Skeleton className={cn("h-3 rounded-full", group.labelWidth)} />
            </div>
          </div>
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

function SidebarFeedRowSkeleton({
  descriptor,
}: {
  descriptor: SidebarSkeletonRowDescriptor;
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

export const DashboardSidebarContent = memo(function DashboardSidebarContent({
  isCategoriesLoading,
  isSidebarVisible,
  onCategoryClick,
  onCategoryPrefetch,
  onFeedClick,
  onFeedPrefetch,
  selectedCategory,
  showFavicons,
  sidebarCategories,
}: DashboardSidebarContentProps) {
  return (
    <AnimatePresence mode="wait">
      {isCategoriesLoading ? (
        <motion.div
          exit={{ opacity: 0, scale: 0.995 }}
          key="sidebar-skeleton"
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        >
          <DashboardSidebarSkeleton />
        </motion.div>
      ) : (
        <motion.div
          animate={{ opacity: 1 }}
          className="space-y-2 px-2"
          initial={{ opacity: 0.96 }}
          key="sidebar-content"
          transition={SIDEBAR_SECTION_TRANSITION}
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
            sidebarCategories.map((categoryNode: CategoryTreeNode, index) => (
              <motion.div
                animate={{
                  opacity: isSidebarVisible ? 1 : 0,
                  y: isSidebarVisible ? 0 : 8,
                }}
                className="space-y-0.5"
                initial={false}
                key={categoryNode.key}
                transition={{
                  ...SIDEBAR_SECTION_TRANSITION,
                  delay: index * 0.035,
                }}
              >
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
                    <FeedCategory
                      category={feedNode}
                      isActive={selectedCategory === feedNode.key}
                      key={feedNode.key}
                      onClick={onFeedClick}
                      onPrefetch={onFeedPrefetch}
                      showFavicon={showFavicons}
                    />
                  ),
                )}
              </motion.div>
            ))
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});
