"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { type Article } from "@/lib";
import { useScrollRestore } from "@/lib/hooks/useScrollRestore";
import { ArrowDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  usePullDownToRefresh,
  useSentinelScrollOffset,
} from "./hooks/usePullDownToRefresh";
import { SENTINEL_SCROLL_OFFSET } from "./hooks/useSentinelLayout";
import { computeNextOrderedCategoryLabels } from "./services/category-display";
import { buildDashboardViewModel } from "./services/dashboard-view-model";
import { formatLastRefreshLabel } from "./services/feed-loader-helpers";

type DashboardViewProps = {
  usePlaceholderData: boolean;
  backgroundMode: BackgroundMode;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  distillStrategy: string;
  onDistillStrategyChange: (value: string) => void;
};

export const DashboardView = ({
  usePlaceholderData,
  backgroundMode,
  onBackgroundModeChange,
  distillStrategy,
  onDistillStrategyChange,
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
    cancelPendingRequest,
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

  const customCategoryLabels = categoryManager.customCategoryLabels;
  const orderedCategoryLabels = categoryManager.orderedCategoryLabels;
  const setOrderedCategoryLabels = categoryManager.setOrderedCategoryLabels;

  const sentinelScrollOffset = useSentinelScrollOffset();
  // DO NOT REMOVE — collapse scroll-pin ref. Coordinates useArticleActions
  // and usePullDownToRefresh to prevent scroll jumping to bottom on collapse.
  const suppressSnapRef = useRef<number | false>(false);
  const {
    ref: feedScrollRef,
    invalidate: invalidateFeedScroll,
    capture: captureFeedScroll,
    settle: settleFeedScroll,
  } = useScrollRestore(FEED_SCROLL_SESSION_KEY, sentinelScrollOffset);
  const { ref: sidebarScrollRef } = useScrollRestore("librerss:scroll:sidebar");

  const articleActions = useArticleActions({
    feed,
    setFeed,
    expandedArticleKey,
    setExpandedArticleKey,
    articleFilter,
    usePlaceholderData,
    categories,
    distillStrategy,
    onExpand: settleFeedScroll,
    suppressSnapRef,
  });

  const {
    handleArticleToggle,
    handleExpandedSwipeRead,
    handleToggleReadState,
    handleToggleStarredState,
  } = articleActions;

  const onArticleToggle = useCallback(
    (article: Article) => void handleArticleToggle(article),
    [handleArticleToggle],
  );
  const onArticleToggleRead = useCallback(
    (article: Article) => void handleToggleReadState(article),
    [handleToggleReadState],
  );
  const onArticleExpandedSwipeRead = useCallback(
    (article: Article) => void handleExpandedSwipeRead(article),
    [handleExpandedSwipeRead],
  );
  const onArticleToggleStarred = useCallback(
    (article: Article) => void handleToggleStarredState(article),
    [handleToggleStarredState],
  );

  const dashboardViewModel = useMemo(
    () =>
      buildDashboardViewModel({
        feed,
        articleFilter,
        expandedArticleKey,
        collapsingArticleKey: articleActions.collapsingArticleKey,
        searchTerm,
        categories,
        customCategoryLabels,
        orderedCategoryLabels,
        selectedCategory,
      }),
    [
      feed,
      articleFilter,
      expandedArticleKey,
      articleActions.collapsingArticleKey,
      searchTerm,
      categories,
      customCategoryLabels,
      orderedCategoryLabels,
      selectedCategory,
    ],
  );

  const {
    filteredFeed,
    displayCategories,
    sidebarCategories,
    selectedFeedUrl,
    selectedFeed,
    categoryOptions,
  } = dashboardViewModel;

  // Memoize by identity key to prevent new object refs from resetting
  // the auto-refresh interval on every render.
  const selectedCategoryNode = useMemo(
    () => dashboardViewModel.selectedCategoryNode,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedCategory, categories],
  );

  useFeedLoadingTimeout({
    loading,
    loadingEpoch,
    timeoutMs: FEED_LOADING_FAILSAFE_MS,
    setLoading,
    onTimeout: cancelPendingRequest,
  });
  useLockDocumentScroll();
  useRevealSidebarOnMount(setIsSidebarVisible);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [selectedCategory, searchTerm, pageSize, articleFilter, setVisibleCount]);

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

  const previousSelectedCategoryRef = useRef(selectedCategory);
  const previousArticleFilterRef = useRef(articleFilter);

  useEffect(() => {
    const categoryChanged =
      previousSelectedCategoryRef.current !== selectedCategory;
    const filterChanged = previousArticleFilterRef.current !== articleFilter;

    if (categoryChanged || filterChanged) {
      setExpandedArticleKey(null);
      invalidateFeedScroll();
    }

    previousSelectedCategoryRef.current = selectedCategory;
    previousArticleFilterRef.current = articleFilter;
  }, [
    selectedCategory,
    articleFilter,
    setExpandedArticleKey,
    invalidateFeedScroll,
  ]);

  const feedScrollRootRef = useRef<HTMLElement | null>(null);
  const feedWrapperRef = useRef<HTMLDivElement | null>(null);
  const mergedFeedScrollRef = useCallback(
    (node: HTMLElement | null) => {
      feedScrollRootRef.current = node;
      feedScrollRef(node);
    },
    [feedScrollRef],
  );

  // Snap the sentinel out of view synchronously before paint on every
  // filter/category switch. useEffect (above) also calls invalidateFeedScroll
  // but fires after paint — by that point a frame with the sentinel exposed
  // may already have been painted when content is sparse.
  //
  // CRITICAL: set a large padding BEFORE reading any layout properties.
  // Reading offsetHeight/clientHeight forces a synchronous reflow. If content
  // just shrank (full articles → empty), the browser clamps scrollTop during
  // that reflow, firing the scroll handler which sets isPulling=true and
  // flashes the sentinel. By writing a large padding first (no reflow needed
  // for a write), the browser's reflow sees enough scrollHeight and never
  // clamps. The ResizeObserver in attachSentinelLayout computes the exact
  // padding within the same frame.
  const hasSentinelSnapMountedRef = useRef(false);
  useLayoutEffect(() => {
    if (!hasSentinelSnapMountedRef.current) {
      hasSentinelSnapMountedRef.current = true;
      return;
    }
    const root = feedScrollRootRef.current;
    const wrapper = feedWrapperRef.current;
    if (!root || !wrapper) return;
    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;
    // Large padding prevents scrollTop clamping during the reflow below.
    wrapper.style.paddingBottom = "9999px";
    viewport.scrollTop = SENTINEL_SCROLL_OFFSET;
  }, [selectedCategory, articleFilter]);

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
    onFeedSwitch: useCallback(() => {
      invalidateFeedScroll();
      setArticleFilter("unread");
    }, [invalidateFeedScroll, setArticleFilter]),
    onBeforeRefresh: captureFeedScroll,
  });

  useDashboardIntervals({ autoRefreshFeedList, setRelativeRefreshTick });

  const {
    sentinelRef: pullSentinelRef,
    pulling: isPulling,
    readyToRefresh,
    sentinelHeight,
  } = usePullDownToRefresh(
    feedScrollRootRef,
    refreshFeedList,
    loading,
    suppressSnapRef,
  );

  const pullRefreshHint = readyToRefresh
    ? "Release to refresh"
    : "Pull down to refresh";

  const lastRefreshLabel = usePlaceholderData
    ? "demo"
    : formatLastRefreshLabel(lastRefreshedAt);

  const handleMarkAllReadLocally = useCallback(
    () => setFeed((f) => f.map((a) => ({ ...a, isRead: true }))),
    [setFeed],
  );

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
    usePlaceholderData,
    onMarkAllReadLocally: handleMarkAllReadLocally,
  });

  const handleCloseSettings = useCallback(
    () => setShowSettingsModal(false),
    [setShowSettingsModal],
  );

  const sidebarProps = useMemo(
    () => ({
      isCategoriesLoading,
      isSidebarVisible,
      sidebarCategories,
      selectedCategory,
      showFavicons,
      onCategoryClick: handleCategoryClick,
      onFeedClick: handleFeedClick,
    }),
    [
      isCategoriesLoading,
      isSidebarVisible,
      sidebarCategories,
      selectedCategory,
      showFavicons,
      handleCategoryClick,
      handleFeedClick,
    ],
  );

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
              className={`h-full transition-opacity anim-duration-ui anim-ease-ui ${
                isSidebarVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              <DashboardSidebarContent {...sidebarProps} />
            </ScrollArea>
          </div>
        </aside>

        <section className="min-h-0 flex-1 overflow-hidden lg:min-w-0">
          <ScrollArea ref={mergedFeedScrollRef} className="h-full">
            <div className="p-1" ref={feedWrapperRef}>
              {/* Pull sentinel: fixed-height scroll item, hidden by scrollTop on mount.
                  Scrolling into it = native pull gesture. */}
              <div
                ref={pullSentinelRef}
                className={`mb-2 flex items-end justify-center bg-background transition-colors duration-150 ${
                  isPulling
                    ? readyToRefresh
                      ? "bg-sky-500/25"
                      : "bg-sky-500/10"
                    : ""
                }`}
                style={{ height: sentinelHeight }}
              >
                {isPulling && (
                  <div className="flex items-center gap-1.5 pb-3 text-sky-600 dark:text-sky-400">
                    <ArrowDown
                      className={`size-4 transition-transform duration-150 ${
                        readyToRefresh
                          ? "scale-110 rotate-180"
                          : "scale-90 opacity-60"
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
                )}
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
                onExpandedSwipeRead={onArticleExpandedSwipeRead}
                onToggle={onArticleToggle}
                onToggleRead={onArticleToggleRead}
                onToggleStarred={onArticleToggleStarred}
              />
            </div>
          </ScrollArea>
        </section>
      </div>

      {showSettingsModal && (
        <SettingsModal
          onClose={handleCloseSettings}
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
          distillStrategy={distillStrategy}
          onDistillStrategyChange={onDistillStrategyChange}
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
          onUpdateFeedSettings={categoryManager.updateFeedSettings}
          isPreviewMode={usePlaceholderData}
        />
      )}
    </div>
  );
};
