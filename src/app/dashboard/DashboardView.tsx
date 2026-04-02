"use client";

import { useLocalStorage } from "@/lib";

import { DashboardDesktopSidebar } from "./components/DashboardDesktopSidebar";
import { DashboardFilterBar } from "./components/DashboardFilterBar";
import { DashboardMobileSidebarSheet } from "./components/DashboardMobileSidebarSheet";
import {
  DashboardFeedViewport,
  DashboardScaffold,
} from "./components/DashboardScaffold";
import { FeedList } from "./components/feed/FeedList";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY } from "./constants";
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
  const [mobileToolbarBottom] = useLocalStorage(
    MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
    true,
  );
  const { feedList, filterBar, settings, sidebar } = useDashboardController({
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
          <DashboardFeedViewport>
            <FeedList
              animatingInArticleKeys={feedList.animatingInArticleKeys}
              articleFilter={feedList.articleFilter}
              articlesPerPage={feedList.articlesPerPage}
              collapsingArticles={feedList.collapsingArticles}
              expandedArticleKey={feedList.expandedArticleKey}
              feedViewKey={feedList.feedViewKey}
              filteredFeed={feedList.filteredFeed}
              getPreExpandViewportSnapshot={feedList.getPreExpandViewportSnapshot}
              hasConfiguredFeeds={feedList.hasConfiguredFeeds}
              hydratedArticleLinks={feedList.hydratedArticleLinks}
              hydratingArticleLinks={feedList.hydratingArticleLinks}
              isCollapseScrollRestoreActive={feedList.isCollapseScrollRestoreActive}
              isInitialLoading={feedList.isInitialLoading}
              isLoadingMore={feedList.isLoadingMore}
              isRefreshing={feedList.isRefreshing}
              loadingMoreArticleCount={feedList.loadingMoreArticleCount}
              onEnteringDone={feedList.onArticleEnteringDone}
              onExpandedSwipeRead={feedList.onArticleExpandedSwipeRead}
              onLoadMore={feedList.onLoadMore}
              onPrepareExpand={feedList.onArticlePrepareExpand}
              onSwipeRead={feedList.onArticleSwipeRead}
              onToggle={feedList.onArticleToggle}
              onToggleRead={feedList.onArticleToggleRead}
              onToggleStarred={feedList.onArticleToggleStarred}
              refreshEpoch={feedList.refreshEpoch}
              searchTerm={feedList.searchTerm}
              showFavicons={feedList.showFavicons}
              updatingArticleState={feedList.updatingArticleState}
            />
          </DashboardFeedViewport>
        }
        filterBar={
          <DashboardFilterBar
            articleFilter={filterBar.articleFilter}
            lastRefreshLabel={filterBar.lastRefreshLabel}
            loading={filterBar.loading}
            onArticleFilterChange={filterBar.setArticleFilter}
          />
        }
        mobileToolbarBottom={mobileToolbarBottom}
        sidebar={
          <DashboardDesktopSidebar
            isSidebarVisible={sidebar.isSidebarVisible}
            sidebarContentProps={sidebar.sidebarContentProps}
            sidebarScrollRef={sidebar.sidebarScrollRef}
          />
        }
      />

      {settings.showSettingsModal && (
        <SettingsPanel
          articlesPerPage={settings.articlesPerPage}
          autoRefreshIntervalMinutes={settings.autoRefreshIntervalMinutes}
          backgroundMode={settings.backgroundMode}
          categories={settings.categories}
          distillStrategy={settings.distillStrategy}
          isPreviewMode={settings.usePlaceholderData}
          onAddCategory={settings.categoryTree.addCategory}
          onAddFeed={settings.categoryTree.addFeedSource}
          onArticlesPerPageChange={settings.setArticlesPerPage}
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
          onRemoveCategory={settings.categoryTree.removeCategory}
          onRemoveFeed={settings.categoryTree.removeFeedSource}
          onRenameCategory={settings.categoryTree.renameCategory}
          onRenameFeed={settings.categoryTree.renameFeedSource}
          onSetFeedEnabled={settings.categoryTree.setFeedSourceEnabled}
          onShowFaviconsChange={settings.setShowFavicons}
          onUpdateFeedSettings={settings.categoryTree.updateFeedSettings}
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
