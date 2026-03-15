import { Rss } from "lucide-react";
import { motion } from "motion/react";
import { memo } from "react";

import { FeedCategory } from "./feed/FeedCategory";
import { DashboardSidebarSkeleton } from "./DashboardLoadingSurfaces";

import { type CategoryTreeNode } from "@/lib";

const SIDEBAR_SECTION_TRANSITION = {
  duration: 0.24,
  ease: [0.16, 1, 0.3, 1] as const,
};

export interface DashboardSidebarContentProps {
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
    <>
      {isCategoriesLoading ? (
        <DashboardSidebarSkeleton />
      ) : (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2 px-2"
          initial={{ opacity: 0, y: 8 }}
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
    </>
  );
});
