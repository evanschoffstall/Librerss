import { Rss } from "lucide-react";
import { memo } from "react";

import { FeedCategory } from "./feed/FeedCategory";
import { DashboardSidebarSkeleton } from "./DashboardLoadingSurfaces";

import { type CategoryTreeNode } from "@/lib";

const sidebarPanelCls = "space-y-2 px-2 anim-fade-in-load-slow";

interface DashboardSidebarContentProps {
  isCategoriesLoading: boolean;
  isSidebarVisible: boolean;
  onCategoryClick: (categoryNode: CategoryTreeNode) => void;
  onFeedClick: (feedNode: CategoryTreeNode) => void;
  selectedCategory: string;
  showFavicons: boolean;
  sidebarCategories: CategoryTreeNode[];
}

export const DashboardSidebarContent = memo(function DashboardSidebarContent({
  isCategoriesLoading,
  isSidebarVisible,
  onCategoryClick,
  onFeedClick,
  selectedCategory,
  showFavicons,
  sidebarCategories,
}: DashboardSidebarContentProps) {
  return (
    <>
      {isCategoriesLoading ? (
        <DashboardSidebarSkeleton />
      ) : (
        <div className={sidebarPanelCls} key="sidebar-content">
          {sidebarCategories.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 px-2 py-10 text-center">
              <div className="flex size-9 items-center justify-center rounded-lg border border-border/30 bg-card/50">
                <Rss
                  className="size-4 text-muted-foreground/40"
                  strokeWidth={1.5}
                />
              </div>
              <p className="text-xs text-muted-foreground/55">No feeds yet</p>
            </div>
          ) : (
            sidebarCategories.map((categoryNode: CategoryTreeNode, index) => (
              <div
                className={`space-y-0.5 anim-fade-in-load-slow transition-opacity anim-duration-ui anim-ease-ui ${
                  isSidebarVisible ? "opacity-100" : "opacity-0"
                }`}
                key={categoryNode.key}
                style={{
                  animationDelay: `${index * 35}ms`,
                  transitionDelay: `${index * 35}ms`,
                }}
              >
                <div className="px-1.5">
                  <button
                    className={`w-full cursor-pointer rounded px-1.5 py-1 text-left font-sans text-[0.65rem] font-semibold uppercase tracking-[0.07em] transition-colors ${
                      selectedCategory === categoryNode.key
                        ? "bg-muted/60 text-foreground"
                        : "text-muted-foreground/65 hover:bg-muted/30 hover:text-foreground"
                    }`}
                    onClick={() => {
                      onCategoryClick(categoryNode);
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
                      showFavicon={showFavicons}
                    />
                  ),
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
});
