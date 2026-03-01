"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useScrollRestore } from "@/lib/hooks/useScrollRestore";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardSidebarContent } from "./components/DashboardSidebarContent";
import { DashboardTopTokenBar } from "./components/DashboardTopTokenBar";
import { FeedList } from "./components/feed/FeedList";
import { SettingsModal } from "./components/settings/SettingsModal";
import { FEED_SCROLL_SESSION_KEY, type BackgroundMode } from "./constants";
import { useArticleActions } from "./hooks/useArticleActions";
import { useCategoryManager } from "./hooks/useCategoryManager";
import { useDashboardEvents } from "./hooks/useDashboardEvents";
import { useDashboardIntervals } from "./hooks/useDashboardIntervals";
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
import { useFeedVisibilityObserver } from "./hooks/useFeedVisibilityObserver";
import { useSwipeUpToRefresh } from "./hooks/useSwipeUpToRefresh";
import { computeNextOrderedCategoryLabels } from "./services/category-display";
import { buildDashboardViewModel } from "./services/dashboard-view-model";
import { formatLastRefreshLabel } from "./services/feed-loader-helpers";

type DashboardViewProps = {
  usePlaceholderData: boolean;
  backgroundMode: BackgroundMode;
  onBackgroundModeChange: (value: BackgroundMode) => void;
};

export const DashboardView = ({
  usePlaceholderData,
  backgroundMode,
  onBackgroundModeChange,
}: DashboardViewProps) => {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [, setRelativeRefreshTick] = useState(0);

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
    onFeedBatchLoaded: setLastRefreshedAt,
  });

  const {
    loadFeedSources,
    loadingEpoch,
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
    fetchAllFeeds,
    fetchCategoryFeeds,
    usePlaceholderData,
  });

  const articleActions = useArticleActions({
    feed,
    setFeed,
    expandedArticleKey,
    setExpandedArticleKey,
    articleFilter,
    usePlaceholderData,
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
    loadingEpoch,
    timeoutMs: FEED_LOADING_FAILSAFE_MS,
    setLoading,
  });
  useLockDocumentScroll();
  useRevealSidebarOnMount(setIsSidebarVisible);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [selectedCategory, searchTerm, pageSize, articleFilter, setVisibleCount]);

  const previousSelectedCategoryRef = useRef(selectedCategory);
  const previousArticleFilterRef = useRef(articleFilter);

  useEffect(() => {
    const categoryChanged =
      previousSelectedCategoryRef.current !== selectedCategory;
    const filterChanged = previousArticleFilterRef.current !== articleFilter;

    if (categoryChanged || filterChanged) {
      setExpandedArticleKey(null);
    }

    previousSelectedCategoryRef.current = selectedCategory;
    previousArticleFilterRef.current = articleFilter;
  }, [selectedCategory, articleFilter, setExpandedArticleKey]);

  useFeedVisibilityObserver({
    sentinelRef,
    pageSize,
    totalFeedItems: filteredFeed.length,
    setVisibleCount,
  });

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

  const { ref: feedScrollRef, invalidate: invalidateFeedScroll } =
    useScrollRestore(FEED_SCROLL_SESSION_KEY);
  const { ref: sidebarScrollRef } = useScrollRestore("librerss:scroll:sidebar");

  const feedScrollRootRef = useRef<HTMLElement | null>(null);
  const mergedFeedScrollRef = useCallback(
    (node: HTMLElement | null) => {
      feedScrollRootRef.current = node;
      feedScrollRef(node);
    },
    [feedScrollRef],
  );

  const {
    refreshFeedList,
    autoRefreshFeedList,
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
    onFeedSwitch: invalidateFeedScroll,
  });

  useDashboardIntervals({ autoRefreshFeedList, setRelativeRefreshTick });

  const {
    contentRef: pullContentRef,
    pulling: isPulling,
    readyToRefresh,
  } = useSwipeUpToRefresh(feedScrollRootRef, refreshFeedList, loading);

  const pullRefreshHint = readyToRefresh
    ? "Release to refresh"
    : "Pull down to refresh";

  const lastRefreshLabel = formatLastRefreshLabel(lastRefreshedAt);

  useDashboardEvents({
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    onOpenSettings: useCallback(
      () => setShowSettingsModal(true),
      [setShowSettingsModal],
    ),
    onOpenFeedsSidebar: useCallback(
      () => setIsMobileSidebarOpen(true),
      [setIsMobileSidebarOpen],
    ),
    onSearchChange: setSearchTerm,
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
    <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4 pb-[env(safe-area-inset-bottom)] pt-[calc(env(safe-area-inset-top)+3.8rem)] md:px-6">
      <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <SheetContent
          side="left"
          className="w-[min(22rem,88vw)] gap-0 p-0 lg:hidden"
        >
          <SheetHeader className="space-y-0 px-4 pb-2 pt-5 text-left">
            <SheetTitle className="text-sm font-semibold tracking-tight text-foreground/90">
              Feeds
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <div className="h-full rounded-xl bg-card/35 px-2 py-2">
              <ScrollArea className="h-full">
                <DashboardSidebarContent {...sidebarProps} />
              </ScrollArea>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <DashboardTopTokenBar
        articleFilter={articleFilter}
        onArticleFilterChange={setArticleFilter}
        lastRefreshLabel={lastRefreshLabel}
        loading={loading}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:items-stretch lg:gap-0">
        <aside className="hidden min-h-0 overflow-hidden lg:block lg:w-[220px] lg:shrink-0">
          <div className="h-full rounded-xl bg-card/35 px-2 py-2">
            <ScrollArea
              ref={sidebarScrollRef}
              className={`h-full transition-opacity anim-duration-ui anim-ease-ui ${isSidebarVisible ? "opacity-100" : "opacity-0"
                }`}
            >
              <DashboardSidebarContent {...sidebarProps} />
            </ScrollArea>
          </div>
        </aside>

        <section className="min-h-0 flex-1 overflow-hidden lg:min-w-0">
          <ScrollArea ref={mergedFeedScrollRef} className="h-full">
            <div ref={pullContentRef} className="relative p-1">
              {/* Pull-down area: sits above content, revealed by translateY */}
              <div
                className={`absolute inset-x-0 z-0 flex items-end justify-center rounded-b-lg pb-3 transition-colors duration-150 md:hidden ${
                  readyToRefresh ? "bg-sky-500/25" : "bg-sky-500/10"
                }`}
                style={{ top: -104, height: 104 }}
              >
                <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                  <ArrowDown
                    className={`size-4 transition-transform duration-150 ${
                      readyToRefresh ? "scale-110 rotate-180" : "scale-90 opacity-60"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium transition-opacity duration-150 ${
                      readyToRefresh ? "opacity-100" : "opacity-70"
                    }`}
                  >
                    {pullRefreshHint}
                  </span>
                </div>
              </div>
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
                sentinelRef={sentinelRef}
                onToggle={(article) =>
                  void articleActions.handleArticleToggle(article)
                }
                onToggleRead={(article) =>
                  void articleActions.handleToggleReadState(article)
                }
                onToggleStarred={(article) =>
                  void articleActions.handleToggleStarredState(article)
                }
                onClearSearch={() => setSearchTerm("")}
                onRefresh={refreshFeedList}
              />
            </div>
          </ScrollArea>
        </section>
      </div>

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          categories={displayCategories}
          categoryOptions={categoryOptions}
          pendingCategoryRemovalLabel={
            categoryManager.pendingCategoryRemovalLabel
          }
          selectedCategory={selectedCategory}
          pageSize={pageSize}
          showFavicons={showFavicons}
          backgroundMode={backgroundMode}
          onPageSizeChange={setPageSize}
          onShowFaviconsChange={setShowFavicons}
          onBackgroundModeChange={onBackgroundModeChange}
          onImportOpml={categoryManager.importOpmlFeeds}
          onDropFeed={categoryManager.moveFeedByDrop}
          onAddFeed={categoryManager.addFeedSource}
          onAddCategory={categoryManager.addCategory}
          onRenameCategory={categoryManager.renameCategory}
          onDropCategory={categoryManager.moveCategoryByDrop}
          onRemoveCategory={categoryManager.removeCategory}
          onRemoveFeed={categoryManager.removeFeedSource}
          onRenameFeed={categoryManager.renameFeedSource}
          onSetFeedEnabled={categoryManager.setFeedSourceEnabled}
        />
      )}
    </div>
  );
};
