"use client";

import { DashboardDesktopSidebar } from "./components/DashboardDesktopSidebar";
import { DashboardMobileSidebarSheet } from "./components/DashboardMobileSidebarSheet";
import {
  DashboardFeedViewport,
  DashboardScaffold,
} from "./components/DashboardScaffold";
import { DashboardTopTokenBar } from "./components/DashboardTopTokenBar";
import { FeedList } from "./components/feed/FeedList";
import { PullToRefreshSentinel } from "./components/PullToRefreshSentinel";
import { SettingsModal } from "./components/settings/SettingsModal";
import {
  type DashboardControllerProps,
  useDashboardController,
} from "./hooks/useDashboardController";

type DashboardViewProps = DashboardControllerProps;

/** Hydrated dashboard view with shared shell chrome and interactive feed surfaces. */
export const DashboardView = ({
  backgroundMode,
  distillStrategy,
  onBackgroundModeChange,
  onDistillStrategyChange,
  usePlaceholderData,
}: DashboardViewProps) => {
  const { feedList, settings, sidebar, topBar } = useDashboardController({
    backgroundMode,
    distillStrategy,
    onBackgroundModeChange,
    onDistillStrategyChange,
    usePlaceholderData,
  });

  return (
    <>
      <DashboardMobileSidebarSheet
        isOpen={sidebar.isMobileSidebarOpen}
        onOpenChange={sidebar.setIsMobileSidebarOpen}
        sidebarContentProps={sidebar.sidebarContentProps}
      />

      <DashboardScaffold
        feed={
          <DashboardFeedViewport
            feedWrapperRef={feedList.feedWrapperRef}
            pullSentinel={
              <PullToRefreshSentinel
                isPulling={feedList.isPulling}
                pullRefreshHint={feedList.pullRefreshHint}
                readyToRefresh={feedList.readyToRefresh}
                sentinelHeight={feedList.sentinelHeight}
                sentinelRef={feedList.pullSentinelRef}
              />
            }
            scrollAreaRef={feedList.mergedFeedScrollRef}
          >
            <FeedList
              collapseSettlingArticleKey={feedList.collapseSettlingArticleKey}
              collapsingArticles={feedList.collapsingArticles}
              expandedArticleKey={feedList.expandedArticleKey}
              filteredFeed={feedList.filteredFeed}
              hydratedArticleLinks={feedList.hydratedArticleLinks}
              hydratingArticleLinks={feedList.hydratingArticleLinks}
              isInitialLoading={feedList.isInitialLoading}
              isRefreshing={feedList.isRefreshing}
              onExpandedSwipeRead={feedList.onArticleExpandedSwipeRead}
              onPrepareExpand={feedList.onArticlePrepareExpand}
              onSwipeRead={feedList.onArticleSwipeRead}
              onToggle={feedList.onArticleToggle}
              onToggleRead={feedList.onArticleToggleRead}
              onToggleStarred={feedList.onArticleToggleStarred}
              pageSize={feedList.pageSize}
              paginationResetKey={feedList.paginationResetKey}
              searchTerm={feedList.searchTerm}
              showFavicons={feedList.showFavicons}
              updatingArticleState={feedList.updatingArticleState}
            />
          </DashboardFeedViewport>
        }
        sidebar={
          <DashboardDesktopSidebar
            isSidebarVisible={sidebar.isSidebarVisible}
            sidebarContentProps={sidebar.sidebarContentProps}
            sidebarScrollRef={sidebar.sidebarScrollRef}
          />
        }
        topBar={
          <DashboardTopTokenBar
            articleFilter={topBar.articleFilter}
            lastRefreshLabel={topBar.lastRefreshLabel}
            loading={topBar.loading}
            onArticleFilterChange={topBar.setArticleFilter}
          />
        }
      />

      {settings.showSettingsModal && (
        <SettingsModal
          autoRefreshIntervalMinutes={settings.autoRefreshIntervalMinutes}
          backgroundMode={settings.backgroundMode}
          categories={settings.categories}
          categoryOptions={settings.categoryOptions}
          distillStrategy={settings.distillStrategy}
          isPreviewMode={settings.usePlaceholderData}
          onAddCategory={settings.categoryTree.addCategory}
          onAddFeed={settings.categoryTree.addFeedSource}
          onAutoRefreshIntervalMinutesChange={
            settings.setAutoRefreshIntervalMinutes
          }
          onBackgroundModeChange={settings.onBackgroundModeChange}
          onClose={settings.handleCloseSettings}
          onDistillStrategyChange={settings.onDistillStrategyChange}
          onDropCategory={(label, targetIndex) => {
            settings.categoryTree.moveCategoryByDrop(label, targetIndex);
            return Promise.resolve();
          }}
          onDropFeed={settings.categoryTree.moveFeedByDrop}
          onImportOpml={settings.categoryTree.importOpmlFeeds}
          onPageSizeChange={settings.setPageSize}
          onRemoveCategory={settings.categoryTree.removeCategory}
          onRemoveFeed={settings.categoryTree.removeFeedSource}
          onRenameCategory={settings.categoryTree.renameCategory}
          onRenameFeed={settings.categoryTree.renameFeedSource}
          onSetFeedEnabled={settings.categoryTree.setFeedSourceEnabled}
          onShowFaviconsChange={settings.setShowFavicons}
          onUpdateFeedSettings={settings.categoryTree.updateFeedSettings}
          pageSize={settings.pageSize}
          pendingCategoryRemovalLabel={
            settings.categoryTree.pendingCategoryRemovalLabel
          }
          selectedCategory={settings.selectedCategory}
          showFavicons={settings.showFavicons}
        />
      )}
    </>
  );
};
