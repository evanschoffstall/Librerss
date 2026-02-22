import { Skeleton } from "@/components/ui/skeleton";
import { type CategoryTreeNode } from "@/lib";
import { AnimatePresence, motion } from "framer-motion";
import { FeedCategory } from "./FeedCategory";

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
    <AnimatePresence mode="wait" initial={false}>
      {isCategoriesLoading ? (
        <motion.div
          key="sidebar-skeleton"
          className="space-y-4 pr-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {[3, 2, 4].map((count, groupIndex) => (
            <div key={groupIndex} className="space-y-1">
              <Skeleton className="mx-2 h-3.5 w-16 rounded" />
              {Array.from({ length: count }).map((_, itemIndex) => (
                <Skeleton
                  key={itemIndex}
                  className="mx-1 h-9 w-[calc(100%-8px)] rounded-lg"
                />
              ))}
            </div>
          ))}
        </motion.div>
      ) : (
        <motion.div
          key="sidebar-content"
          className="space-y-4 pr-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {sidebarCategories.length === 0 ? (
            <div className="px-2 py-8 text-xs text-muted-foreground/70">
              No feed sources yet.
            </div>
          ) : (
            sidebarCategories.map((categoryNode: CategoryTreeNode, index) => (
              <div
                key={categoryNode.key}
                className={`space-y-1 transition-opacity duration-300 ease-out ${isSidebarVisible ? "opacity-100" : "opacity-0"
                  }`}
                style={{ transitionDelay: `${index * 35}ms` }}
              >
                <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                  <button
                    type="button"
                    className={`w-full rounded px-1 py-1 text-left text-[11px] font-medium uppercase tracking-wide transition-colors ${selectedCategory === categoryNode.key
                        ? "bg-muted/60 text-foreground"
                        : "text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground"
                      }`}
                    onClick={() => onCategoryClick(categoryNode)}
                  >
                    {categoryNode.label}
                  </button>
                </div>
                {(categoryNode.children ?? []).map((feedNode: CategoryTreeNode) => (
                  <FeedCategory
                    key={feedNode.key}
                    category={feedNode}
                    isActive={selectedCategory === feedNode.key}
                    showFavicon={showFavicons}
                    onClick={() => onFeedClick(feedNode)}
                  />
                ))}
              </div>
            ))
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
