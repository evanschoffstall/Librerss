"use client";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useCallback, useEffect } from "react";
import { DashboardSidebarContent } from "./components/DashboardSidebarContent";
import { FeedList } from "./components/feed/FeedList";
import { SettingsModal } from "./components/settings/SettingsModal";
import {
  ARTICLE_FILTER_OPTIONS
} from "./helpers/article-filters";
import { computeNextOrderedCategoryLabels } from "./helpers/category-display";
import { buildDashboardViewModel } from "./helpers/dashboard-view-model";
import { useArticleActions } from "./hooks/useArticleActions";
import { useCategoryManager } from "./hooks/useCategoryManager";
import { useDashboardEvents } from "./hooks/useDashboardEvents";
import {
  useDashboardBroadcasts,
  useDashboardInitialization,
  useFeedLoadingTimeout,
  useLockDocumentScroll,
  useRevealSidebarOnMount,
} from "./hooks/useDashboardViewEffects";
import { useDashboardViewHandlers } from "./hooks/useDashboardViewHandlers";
import { useDashboardViewState } from "./hooks/useDashboardViewState";
import { useFeedLoader } from "./hooks/useFeedLoader";

type DashboardViewProps = {
  usePlaceholderData: boolean;
};

export const DashboardView = ({ usePlaceholderData }: DashboardViewProps) => {
  const {
    feed,
    setFeed,
    loading,
    setLoading,
    categories,
    setCategories,
    categoriesRef,
    selectedCategory,
    setSelectedCategory,
    searchTerm,
    setSearchTerm,
    expandedArticleKey,
    setExpandedArticleKey,
    showSettingsModal,
    setShowSettingsModal,
    isSidebarVisible,
    setIsSidebarVisible,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    articleFilter,
    setArticleFilter,
    pageSize,
    setPageSize,
    showFavicons,
    setShowFavicons,
    visibleCount,
    setVisibleCount,
    sentinelRef,
    isCategoriesLoading,
    setIsCategoriesLoading,
    hasInitializedDashboardRef,
  } = useDashboardViewState();

  const feedLoader = useFeedLoader({
    usePlaceholderData,
    categoriesRef,
    setFeed,
    setCategories,
    setExpandedArticleKey,
    setLoading,
  });

  const {
    loadFeedSources,
    fetchFeed,
    fetchCategoryFeeds,
    fetchAllFeeds,
    FEED_LOADING_FAILSAFE_MS,
  } = feedLoader;

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

  const {
    filteredFeed,
    displayCategories,
    sidebarCategories,
    selectedCategoryNode,
    selectedFeedUrl,
    selectedFeed,
    categoryOptions,
  } = buildDashboardViewModel({
    feed,
    articleFilter,
    expandedArticleKey,
    collapsingArticleKey: articleActions.collapsingArticleKey,
    searchTerm,
    categories,
    customCategoryLabels,
    orderedCategoryLabels,
    selectedCategory,
  });

  useFeedLoadingTimeout({
    loading,
    timeoutMs: FEED_LOADING_FAILSAFE_MS,
    setLoading,
  });
  useLockDocumentScroll();
  useRevealSidebarOnMount(setIsSidebarVisible);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [feed, searchTerm, pageSize, articleFilter, setVisibleCount]);

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
  }, [filteredFeed.length, pageSize, sentinelRef, setVisibleCount]);

  useDashboardInitialization({
    hasInitializedDashboardRef,
    selectedCategory,
    loadFeedSources,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    setSelectedCategory,
    setIsCategoriesLoading,
  });

  useEffect(() => {
    setOrderedCategoryLabels((currentLabels) =>
      computeNextOrderedCategoryLabels(
        categories,
        customCategoryLabels,
        currentLabels,
      ),
    );
  }, [categories, customCategoryLabels, setOrderedCategoryLabels]);

  useDashboardBroadcasts({ selectedFeed, searchTerm });

  const feedScrollRef = useScrollRestore("librerss:scroll:feed");
  const sidebarScrollRef = useScrollRestore("librerss:scroll:sidebar");

  const {
    refreshFeedList,
    handleRefreshSelection,
    handleFeedClick,
    handleCategoryClick,
  } = useDashboardViewHandlers({
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    setSelectedCategory,
    setIsMobileSidebarOpen,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
  });

  useDashboardEvents({
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    onOpenSettings: useCallback(() => setShowSettingsModal(true), [setShowSettingsModal]),
    onOpenFeedsSidebar: useCallback(() => setIsMobileSidebarOpen(true), [setIsMobileSidebarOpen]),
    onSearchChange: useCallback((term: string) => setSearchTerm(term), [setSearchTerm]),
    onRefresh: handleRefreshSelection,
  });

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
            ref={sidebarScrollRef}
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

          <ScrollArea ref={feedScrollRef} className="min-h-0 flex-1">
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
              onRefresh={refreshFeedList}
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
