import { Skeleton } from "@/components/ui/skeleton";
import { type CategoryTreeNode } from "@/lib";
import { Rss } from "lucide-react";
import { memo } from "react";
import { FeedCategory } from "./feed/FeedCategory";

const sidebarPanelCls = "space-y-2 px-2 anim-fade-in-load-slow";

type DashboardSidebarContentProps = {
  isCategoriesLoading: boolean;
  isSidebarVisible: boolean;
  sidebarCategories: CategoryTreeNode[];
  selectedCategory: string;
  showFavicons: boolean;
  onCategoryClick: (categoryNode: CategoryTreeNode) => void;
  onFeedClick: (feedNode: CategoryTreeNode) => void;
};

export const DashboardSidebarContent = memo(function DashboardSidebarContent({
  isCategoriesLoading,
  isSidebarVisible,
  sidebarCategories,
  selectedCategory,
  showFavicons,
  onCategoryClick,
  onFeedClick,
}: DashboardSidebarContentProps) {
  return (
    <>
      {isCategoriesLoading ? (
        <div key="sidebar-loading" className={sidebarPanelCls}>
          {[3, 2, 4].map((count, groupIndex) => (
            <div key={groupIndex} className="space-y-0.5">
              <div className="px-1.5">
                <Skeleton className="h-6 w-20 rounded" />
              </div>
              {Array.from({ length: count }).map((_, itemIndex) => (
                <div
                  key={itemIndex}
                  className="mx-1 flex items-center justify-between gap-2 rounded-lg border-l-2 border-transparent px-2 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <Skeleton
                      className={`h-3.5 ${itemIndex % 2 === 0 ? "w-24" : "w-20"}`}
                    />
                    <Skeleton
                      className={`h-2.5 ${itemIndex % 2 === 0 ? "w-16" : "w-20"}`}
                    />
                  </div>
                  <Skeleton className="size-3.5 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div key="sidebar-content" className={sidebarPanelCls}>
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
                key={categoryNode.key}
                className={`space-y-0.5 anim-fade-in-load-slow transition-opacity anim-duration-ui anim-ease-ui ${
                  isSidebarVisible ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  animationDelay: `${index * 35}ms`,
                  transitionDelay: `${index * 35}ms`,
                }}
              >
                <div className="px-1.5">
                  <button
                    type="button"
                    className={`w-full cursor-pointer rounded px-1.5 py-1 text-left font-sans text-[0.65rem] font-semibold uppercase tracking-[0.07em] transition-colors ${
                      selectedCategory === categoryNode.key
                        ? "bg-muted/60 text-foreground"
                        : "text-muted-foreground/65 hover:bg-muted/30 hover:text-foreground"
                    }`}
                    onClick={() => onCategoryClick(categoryNode)}
                  >
                    {categoryNode.label}
                  </button>
                </div>
                {(categoryNode.children ?? []).map(
                  (feedNode: CategoryTreeNode) => (
                    <FeedCategory
                      key={feedNode.key}
                      category={feedNode}
                      isActive={selectedCategory === feedNode.key}
                      showFavicon={showFavicons}
                      onClick={onFeedClick}
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
