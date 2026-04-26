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
import { MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { DashboardSettingsModal } from "@/app/dashboard/dashboard-view/settings-modal";
import { useLocalStorage } from "@/lib/hooks";

/**
 * Describes the props for the dashboard view component.
 */
type DashboardViewProps = DashboardControllerProps;

/**
 * Render the dashboard view component.
 * @param props - The component props.
 * @returns The rendered dashboard view component.
 */
export const DashboardView = (props: DashboardViewProps) => {
  const {
    backgroundMode,
    distillStrategy,
    onBackgroundModeChange,
    onDistillStrategyChange,
    usePlaceholderData,
  } = props;
  const [mobileGroupedLayout] = useLocalStorage(
    MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
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
        mobileToolbarBottom={mobileGroupedLayout}
        sidebar={sidebar}
      />
      <DashboardSettingsModal settings={settings} />
    </>
  );
};
/**
 * Describes the props for the dashboard feed section component.
 */
interface DashboardFeedSectionProps {
  feedList: ReturnType<typeof useDashboardController>["feedList"];
}

/**
 * Describes the props for the dashboard filter section component.
 */
interface DashboardFilterSectionProps {
  filterBar: ReturnType<typeof useDashboardController>["filterBar"];
}
/**
 * Describes the props for the dashboard shell view component.
 */
interface DashboardShellViewProps {
  feedList: ReturnType<typeof useDashboardController>["feedList"];
  filterBar: ReturnType<typeof useDashboardController>["filterBar"];
  mobileToolbarBottom: boolean;
  sidebar: ReturnType<typeof useDashboardController>["sidebar"];
}

/**
 * Describes the props for the dashboard sidebar section component.
 */
interface DashboardSidebarSectionProps {
  sidebar: ReturnType<typeof useDashboardController>["sidebar"];
}
/**
 * Describes the props for the dashboard sidebar sheet component.
 */
interface DashboardSidebarSheetProps {
  sidebar: ReturnType<typeof useDashboardController>["sidebar"];
}

/**
 * Render the dashboard feed section component.
 * @param props - The component props.
 * @returns The rendered dashboard feed section component.
 */
function DashboardFeedSection(props: DashboardFeedSectionProps) {
  const { feedList } = props;
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
/**
 * Render the dashboard filter section component.
 * @param props - The component props.
 * @returns The rendered dashboard filter section component.
 */
function DashboardFilterSection(props: DashboardFilterSectionProps) {
  const { filterBar } = props;
  return (
    <DashboardFilterBar
      articleFilter={filterBar.articleFilter}
      articleSortOrder={filterBar.articleSortOrder}
      isSearchPending={filterBar.isSearchPending}
      isShellLoading={filterBar.isShellLoading}
      lastRefreshLabel={filterBar.lastRefreshLabel}
      loading={filterBar.loading}
      onArticleFilterChange={filterBar.setArticleFilter}
      onArticleSortOrderChange={filterBar.setArticleSortOrder}
    />
  );
}

/**
 * Render the dashboard shell view component.
 * @param props - The component props.
 * @returns The rendered dashboard shell view component.
 */
function DashboardShellView(props: DashboardShellViewProps) {
  const { feedList, filterBar, mobileToolbarBottom, sidebar } = props;
  return (
    <DashboardScaffold
      feed={<DashboardFeedSection feedList={feedList} />}
      filterBar={<DashboardFilterSection filterBar={filterBar} />}
      mobileToolbarBottom={mobileToolbarBottom}
      sidebar={<DashboardSidebarSection sidebar={sidebar} />}
    />
  );
}
/**
 * Render the dashboard sidebar section component.
 * @param props - The component props.
 * @returns The rendered dashboard sidebar section component.
 */
function DashboardSidebarSection(props: DashboardSidebarSectionProps) {
  const { sidebar } = props;
  return (
    <DashboardDesktopSidebar
      isSidebarVisible={sidebar.isSidebarVisible}
      sidebarContentProps={sidebar.sidebarContentProps}
      sidebarScrollRef={sidebar.sidebarScrollRef}
    />
  );
}

/**
 * Render the dashboard sidebar sheet component.
 * @param props - The component props.
 * @returns The rendered dashboard sidebar sheet component.
 */
function DashboardSidebarSheet(props: DashboardSidebarSheetProps) {
  const { sidebar } = props;
  return (
    <DashboardMobileSidebarSheet
      isOpen={sidebar.isMobileSidebarOpen}
      onOpenChange={sidebar.setIsMobileSidebarOpen}
      sidebarContentProps={sidebar.sidebarContentProps}
    />
  );
}
