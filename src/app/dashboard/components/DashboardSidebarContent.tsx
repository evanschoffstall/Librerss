import { Skeleton } from "@/components/ui/skeleton";
import { type CategoryTreeNode } from "@/lib";
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

export function DashboardSidebarContent({
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
              <Skeleton className="mx-2 h-3.5 w-16 rounded" />
              {Array.from({ length: count }).map((_, itemIndex) => (
                <Skeleton
                  key={itemIndex}
                  className="mx-1 h-9 w-[calc(100%-8px)] rounded-lg"
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div key="sidebar-content" className={sidebarPanelCls}>
          {sidebarCategories.length === 0 ? (
            <div className="px-2 py-8 font-sans text-sm leading-6 text-muted-foreground/75">
              No feed sources yet.
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
                <div className="px-1.5 font-sans text-[0.74rem] font-semibold tracking-[0.02em] text-muted-foreground/70">
                  <button
                    type="button"
                    className={`w-full rounded px-1.5 py-1 text-left font-sans text-[0.76rem] font-semibold tracking-[0.01em] transition-colors ${
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
                      onClick={() => onFeedClick(feedNode)}
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
}
