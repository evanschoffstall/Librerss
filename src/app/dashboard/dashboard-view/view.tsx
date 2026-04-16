"use client";

import { DashboardToolbar } from "@/app/dashboard/dashboard-components";
import { FeedList } from "@/app/dashboard/dashboard-components/feed-view";
import {
  DashboardDesktopSidebar,
  DashboardFeedViewport,
  DashboardFilterBar,
  DashboardMobileSidebarSheet,
  DashboardScaffold,
} from "@/app/dashboard/dashboard-components/layout";
import {
  type DashboardControllerProps,
  useDashboardController,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller";
import { MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { DashboardSettingsModal } from "@/app/dashboard/dashboard-view/settings-modal";
import { useLocalStorage } from "@/lib/hooks";

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
      <DashboardSidebarSheet sidebar={sidebar} />
      <DashboardToolbar
        isShellLoading={filterBar.isShellLoading}
        startInShellLoading
      />
      <DashboardShellView
        feedList={feedList}
        filterBar={filterBar}
        mobileToolbarBottom={mobileToolbarBottom}
        sidebar={sidebar}
      />
      <DashboardSettingsModal settings={settings} />
    </>
  );
};

function DashboardFeedSection({
  feedList,
}: {
  feedList: ReturnType<typeof useDashboardController>["feedList"];
}) {
  return (
    <DashboardFeedViewport>
      <FeedList
        animatingInArticleKeys={feedList.animatingInArticleKeys}
        articleFilter={feedList.articleFilter}
        articlesPerPage={feedList.articlesPerPage}
        canLoadMoreFromServer={feedList.canLoadMoreFromServer}
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
  );
}

function DashboardFilterSection({
  filterBar,
}: {
  filterBar: ReturnType<typeof useDashboardController>["filterBar"];
}) {
  return (
    <DashboardFilterBar
      articleFilter={filterBar.articleFilter}
      isShellLoading={filterBar.isShellLoading}
      lastRefreshLabel={filterBar.lastRefreshLabel}
      loading={filterBar.loading}
      onArticleFilterChange={filterBar.setArticleFilter}
    />
  );
}

function DashboardShellView({
  feedList,
  filterBar,
  mobileToolbarBottom,
  sidebar,
}: {
  feedList: ReturnType<typeof useDashboardController>["feedList"];
  filterBar: ReturnType<typeof useDashboardController>["filterBar"];
  mobileToolbarBottom: boolean;
  sidebar: ReturnType<typeof useDashboardController>["sidebar"];
}) {
  return (
    <DashboardScaffold
      feed={<DashboardFeedSection feedList={feedList} />}
      filterBar={<DashboardFilterSection filterBar={filterBar} />}
      mobileToolbarBottom={mobileToolbarBottom}
      sidebar={<DashboardSidebarSection sidebar={sidebar} />}
    />
  );
}

function DashboardSidebarSection({
  sidebar,
}: {
  sidebar: ReturnType<typeof useDashboardController>["sidebar"];
}) {
  return (
    <DashboardDesktopSidebar
      isSidebarVisible={sidebar.isSidebarVisible}
      sidebarContentProps={sidebar.sidebarContentProps}
      sidebarScrollRef={sidebar.sidebarScrollRef}
    />
  );
}

function DashboardSidebarSheet({
  sidebar,
}: {
  sidebar: ReturnType<typeof useDashboardController>["sidebar"];
}) {
  return (
    <DashboardMobileSidebarSheet
      isOpen={sidebar.isMobileSidebarOpen}
      onOpenChange={sidebar.setIsMobileSidebarOpen}
      sidebarContentProps={sidebar.sidebarContentProps}
    />
  );
}
