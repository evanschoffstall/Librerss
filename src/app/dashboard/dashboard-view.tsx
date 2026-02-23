"use client";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useLocalStorage, type Article, type CategoryTreeNode } from "@/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardSidebarContent } from "./components/DashboardSidebarContent";
import { FeedList } from "./components/feed/FeedList";
import { SettingsModal } from "./components/settings/SettingsModal";
import {
  ALL_FEEDS_NODE_KEY,
  DASHBOARD_EVENTS,
  DEFAULT_FEED_URL,
  INITIAL_CATEGORIES,
} from "./constants";
import {
  ARTICLE_FILTER_OPTIONS,
  filterArticlesByState,
  type ArticleFilter,
} from "./helpers/article-filters";
import {
  buildDisplayCategories,
  computeNextOrderedCategoryLabels,
} from "./helpers/category-display";
import {
  flattenCategoryFeeds,
  SYSTEM_ALL_FEEDS_CATEGORY,
} from "./helpers/category-helpers";
import {
  initializeDashboardSelection,
  refreshCurrentSelection,
} from "./helpers/selection";
import { useArticleActions } from "./hooks/useArticleActions";
import { useCategoryManager } from "./hooks/useCategoryManager";
import { useDashboardEvents } from "./hooks/useDashboardEvents";
import { useFeedLoader } from "./hooks/useFeedLoader";

type DashboardViewProps = {
  usePlaceholderData: boolean;
};

export const DashboardView = ({ usePlaceholderData }: DashboardViewProps) => {
  const [feed, setFeed] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const categoriesRef = useRef<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  categoriesRef.current = categories;
  const [selectedCategory, setSelectedCategory] = useLocalStorage<string>(
    "librerss:selectedCategory",
    ALL_FEEDS_NODE_KEY,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedArticleKey, setExpandedArticleKey] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [articleFilter, setArticleFilter] = useLocalStorage<ArticleFilter>(
    "librerss:articleFilter",
    "unread",
  );
  const [pageSize, setPageSize] = useLocalStorage<number>("librerss:pageSize", 25);
  const [showFavicons, setShowFavicons] = useLocalStorage<boolean>("librerss:showFavicons", true);
  const [visibleCount, setVisibleCount] = useState<number>(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const hasInitializedDashboardRef = useRef(false);

  const feedLoader = useFeedLoader({
    usePlaceholderData,
    categoriesRef,
    setFeed,
    setCategories,
    setExpandedArticleKey,
    setLoading,
  });

  const { loadFeedSources, fetchFeed, fetchCategoryFeeds, fetchAllFeeds } = feedLoader;

  const categoryManager = useCategoryManager({
    categories,
    selectedCategory,
    setCategories,
    setSelectedCategory,
    setFeed,
    loadFeedSources,
    fetchFeed,
    fetchCategoryFeeds,
  });

  const articleActions = useArticleActions({
    feed,
    setFeed,
    expandedArticleKey,
    setExpandedArticleKey,
    articleFilter,
  });

  const customCategoryLabels = categoryManager.customCategoryLabels;
  const orderedCategoryLabels = categoryManager.orderedCategoryLabels;
  const setOrderedCategoryLabels = categoryManager.setOrderedCategoryLabels;

  const feedByState = filterArticlesByState(
    feed,
    articleFilter,
    expandedArticleKey,
    articleActions.collapsingArticleKey,
  );

  const filteredFeed = feedByState.filter(
    (article) =>
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (article.content || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const availableSources = flattenCategoryFeeds(categories);
  const selectedFeedNode = availableSources.find((source) => source.key === selectedCategory);
  const displayCategories = buildDisplayCategories(
    categories,
    customCategoryLabels,
    orderedCategoryLabels,
  );

  const sidebarCategories = [SYSTEM_ALL_FEEDS_CATEGORY, ...displayCategories];
  const selectedCategoryNode = sidebarCategories.find((node) => node.key === selectedCategory);
  const selectedFeedUrl = selectedFeedNode?.data?.url;
  const selectedFeed = selectedFeedNode?.label ?? selectedCategoryNode?.label;
  const categoryOptions = displayCategories.map((node) => node.label);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLoading(false);
      toast.error("Feed loading timed out.", {
        description: "Please try refreshing the selected source again.",
      });
    }, 20_000);

    return () => window.clearTimeout(timeoutId);
  }, [loading]);

  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsSidebarVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [feed, searchTerm, pageSize, articleFilter]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((previousCount) =>
            Math.min(previousCount + pageSize, filteredFeed.length),
          );
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredFeed.length, pageSize]);

  useEffect(() => {
    if (hasInitializedDashboardRef.current) {
      return;
    }

    hasInitializedDashboardRef.current = true;

    void initializeDashboardSelection({
      selectedCategory,
      loadFeedSources,
      fetchAllFeeds,
      fetchFeed,
      fetchCategoryFeeds,
      setSelectedCategory,
      setIsCategoriesLoading,
    });
  }, [
    selectedCategory,
    loadFeedSources,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    setSelectedCategory,
  ]);

  useEffect(() => {
    setOrderedCategoryLabels((currentLabels) =>
      computeNextOrderedCategoryLabels(
        categories,
        customCategoryLabels,
        currentLabels,
      ),
    );
  }, [categories, customCategoryLabels, setOrderedCategoryLabels]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.TITLE_CHANGE, {
        detail: { title: selectedFeed ?? "LibreRSS" },
      }),
    );
  }, [selectedFeed]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_SYNC, {
        detail: { term: searchTerm },
      }),
    );
  }, [searchTerm]);

  const handleRefreshSelection = useCallback(() => {
    refreshCurrentSelection({
      selectedCategory,
      selectedFeedUrl,
      selectedCategoryNode,
      fetchAllFeeds,
      fetchFeed,
      fetchCategoryFeeds,
    });
  }, [
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
  ]);

  useDashboardEvents({
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    onOpenSettings: useCallback(() => setShowSettingsModal(true), []),
    onOpenFeedsSidebar: useCallback(() => setIsMobileSidebarOpen(true), []),
    onSearchChange: useCallback((term: string) => setSearchTerm(term), []),
    onRefresh: handleRefreshSelection,
  });

  const handleFeedClick = (feedNode: CategoryTreeNode) => {
    setSelectedCategory(feedNode.key);
    setIsMobileSidebarOpen(false);
    if (feedNode.data?.url) {
      void fetchFeed(feedNode.data.url);
    }
  };

  const handleCategoryClick = (categoryNode: CategoryTreeNode) => {
    setSelectedCategory(categoryNode.key);
    setIsMobileSidebarOpen(false);

    if (categoryNode.key === ALL_FEEDS_NODE_KEY) {
      void fetchAllFeeds();
      return;
    }

    void fetchCategoryFeeds(categoryNode);
  };

  const sidebarProps = {
    isCategoriesLoading,
    isSidebarVisible,
    sidebarCategories,
    selectedCategory,
    showFavicons,
    onCategoryClick: handleCategoryClick,
    onFeedClick: handleFeedClick,
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-20 md:px-6">
      <Drawer open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <DrawerContent className="max-h-[85vh] lg:hidden">
          <DrawerHeader>
            <DrawerTitle>Feeds</DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-[65vh]">
              <DashboardSidebarContent {...sidebarProps} />
            </ScrollArea>
          </div>
        </DrawerContent>
      </Drawer>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:items-stretch">
        <aside className="hidden min-h-0 overflow-hidden lg:block lg:w-[220px] lg:shrink-0">
          <ScrollArea
            className={`h-full transition-opacity anim-duration-ui anim-ease-ui ${isSidebarVisible ? "opacity-100" : "opacity-0"
              }`}
          >
            <DashboardSidebarContent {...sidebarProps} />
          </ScrollArea>
        </aside>

        <Separator orientation="vertical" className="hidden lg:block" />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-w-0">
          <div className="mb-2 flex items-center gap-2 pr-3">
            {ARTICLE_FILTER_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setArticleFilter(value)}
                className={`rounded-md px-2 py-1 text-xs capitalize transition-colors ${articleFilter === value
                    ? "bg-muted/70 text-foreground"
                    : "text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground"
                  }`}
              >
                {value}
              </button>
            ))}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <FeedList
              loading={loading}
              filteredFeed={filteredFeed}
              visibleCount={visibleCount}
              expandedArticleKey={expandedArticleKey}
              hydratedArticleLinks={articleActions.hydratedArticleLinks}
              hydratingArticleLinks={articleActions.hydratingArticleLinks}
              updatingArticleState={articleActions.updatingArticleState}
              showFavicons={showFavicons}
              searchTerm={searchTerm}
              selectedCategory={selectedCategory}
              selectedFeedUrl={selectedFeedUrl}
              sentinelRef={sentinelRef}
              onToggle={(article) => void articleActions.handleArticleToggle(article)}
              onToggleRead={(article) => void articleActions.handleToggleReadState(article)}
              onToggleStarred={(article) => void articleActions.handleToggleStarredState(article)}
              onClearSearch={() => setSearchTerm("")}
              onRefresh={() => {
                if (selectedCategory === ALL_FEEDS_NODE_KEY) {
                  void fetchAllFeeds();
                  return;
                }

                void fetchFeed(selectedFeedUrl ?? DEFAULT_FEED_URL);
              }}
            />
          </ScrollArea>
        </section>
      </div>

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          categories={displayCategories}
          categoryOptions={categoryOptions}
          pendingCategoryRemovalLabel={categoryManager.pendingCategoryRemovalLabel}
          selectedCategory={selectedCategory}
          pageSize={pageSize}
          showFavicons={showFavicons}
          onPageSizeChange={setPageSize}
          onShowFaviconsChange={setShowFavicons}
          onImportOpml={categoryManager.importOpmlFeeds}
          onSelectFeed={categoryManager.selectFeedByKey}
          onDropFeed={categoryManager.moveFeedByDrop}
          onAddFeed={categoryManager.addFeedSource}
          onAddCategory={categoryManager.addCategory}
          onRenameCategory={categoryManager.renameCategory}
          onDropCategory={categoryManager.moveCategoryByDrop}
          onRemoveCategory={categoryManager.removeCategory}
          onRemoveFeed={categoryManager.removeFeedSource}
          onRenameFeed={categoryManager.renameFeedSource}
        />
      )}
    </div>
  );
};
