"use client";

import { ArrowDown } from "lucide-react";
import { motion } from "motion/react";

import {
  DashboardFeedViewport,
  DashboardScaffold,
} from "./components/DashboardScaffold";
import { DashboardSidebarContent } from "./components/DashboardSidebarContent";
import { DashboardTopTokenBar } from "./components/DashboardTopTokenBar";
import { FeedList } from "./components/feed/FeedList";
import { SettingsModal } from "./components/settings/SettingsModal";
import {
  type DashboardViewControllerProps,
  useDashboardViewController,
} from "./hooks/useDashboardViewController";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type DashboardViewProps = DashboardViewControllerProps;

const DASHBOARD_SIDEBAR_TRANSITION = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1] as const,
};

const DASHBOARD_PULL_HINT_TRANSITION = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1] as const,
};

/** Hydrated dashboard view with shared shell chrome and interactive feed surfaces. */
export const DashboardView = ({
  backgroundMode,
  distillStrategy,
  onBackgroundModeChange,
  onDistillStrategyChange,
  usePlaceholderData,
}: DashboardViewProps) => {
  const { feedList, settings, sidebar, topBar } = useDashboardViewController({
    backgroundMode,
    distillStrategy,
    onBackgroundModeChange,
    onDistillStrategyChange,
    usePlaceholderData,
  });

  return (
    <>
      <Sheet
        onOpenChange={sidebar.setIsMobileSidebarOpen}
        open={sidebar.isMobileSidebarOpen}
      >
        <SheetContent
          className="
            w-[min(22rem,88vw)] gap-0 p-0
            lg:hidden
          "
          side="left"
        >
          <SheetHeader className="space-y-0 px-4 pt-5 pb-2 text-left">
            <SheetTitle
              className="
                text-sm font-semibold tracking-tight text-foreground/90
              "
            >
              Feeds
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <div className="h-full rounded-xl bg-card/35 p-2">
              <ScrollArea className="h-full">
                <DashboardSidebarContent {...sidebar.sidebarProps} />
              </ScrollArea>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <DashboardScaffold
        feed={
          <DashboardFeedViewport
            feedWrapperRef={feedList.feedWrapperRef}
            pullSentinel={
              <motion.div
                animate={{
                  backgroundColor: feedList.isPulling
                    ? feedList.readyToRefresh
                      ? "rgb(14 165 233 / 0.25)"
                      : "rgb(14 165 233 / 0.10)"
                    : "rgb(0 0 0 / 0)",
                }}
                className="mb-2 flex items-end justify-center bg-background"
                initial={false}
                ref={feedList.pullSentinelRef}
                style={{ height: feedList.sentinelHeight }}
                transition={DASHBOARD_PULL_HINT_TRANSITION}
              >
                {feedList.isPulling && (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="
                      flex items-center gap-1.5 pb-3 text-sky-600
                      dark:text-sky-400
                    "
                    initial={{ opacity: 0, y: 6 }}
                    transition={DASHBOARD_PULL_HINT_TRANSITION}
                  >
                    <motion.div
                      animate={{
                        opacity: feedList.readyToRefresh ? 1 : 0.6,
                        rotate: feedList.readyToRefresh ? 180 : 0,
                        scale: feedList.readyToRefresh ? 1.1 : 0.9,
                      }}
                      initial={false}
                      transition={DASHBOARD_PULL_HINT_TRANSITION}
                    >
                      <ArrowDown className="size-4" />
                    </motion.div>
                    <motion.span
                      animate={{ opacity: feedList.readyToRefresh ? 1 : 0.7 }}
                      className="text-xs font-medium"
                      initial={false}
                      transition={DASHBOARD_PULL_HINT_TRANSITION}
                    >
                      {feedList.pullRefreshHint}
                    </motion.span>
                  </motion.div>
                )}
              </motion.div>
            }
            scrollAreaRef={feedList.mergedFeedScrollRef}
          >
            <FeedList
              collapsingArticleKey={feedList.collapsingArticleKey}
              collapsingArticleMode={feedList.collapsingArticleMode}
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
          <motion.div
            animate={{
              opacity:
                sidebar.sidebarProps.isCategoriesLoading ||
                sidebar.isSidebarVisible
                  ? 1
                  : 0,
              y:
                sidebar.sidebarProps.isCategoriesLoading ||
                sidebar.isSidebarVisible
                  ? 0
                  : 8,
            }}
            className="h-full"
            initial={false}
            transition={DASHBOARD_SIDEBAR_TRANSITION}
          >
            <ScrollArea className="h-full" ref={sidebar.sidebarScrollRef}>
              <DashboardSidebarContent {...sidebar.sidebarProps} />
            </ScrollArea>
          </motion.div>
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
          onAddCategory={settings.categoryManager.addCategory}
          onAddFeed={settings.categoryManager.addFeedSource}
          onAutoRefreshIntervalMinutesChange={
            settings.setAutoRefreshIntervalMinutes
          }
          onBackgroundModeChange={settings.onBackgroundModeChange}
          onClose={settings.handleCloseSettings}
          onDistillStrategyChange={settings.onDistillStrategyChange}
          onDropCategory={(label, targetIndex) => {
            settings.categoryManager.moveCategoryByDrop(label, targetIndex);
            return Promise.resolve();
          }}
          onDropFeed={settings.categoryManager.moveFeedByDrop}
          onImportOpml={settings.categoryManager.importOpmlFeeds}
          onPageSizeChange={settings.setPageSize}
          onRemoveCategory={settings.categoryManager.removeCategory}
          onRemoveFeed={settings.categoryManager.removeFeedSource}
          onRenameCategory={settings.categoryManager.renameCategory}
          onRenameFeed={settings.categoryManager.renameFeedSource}
          onSetFeedEnabled={settings.categoryManager.setFeedSourceEnabled}
          onShowFaviconsChange={settings.setShowFavicons}
          onUpdateFeedSettings={settings.categoryManager.updateFeedSettings}
          pageSize={settings.pageSize}
          pendingCategoryRemovalLabel={
            settings.categoryManager.pendingCategoryRemovalLabel
          }
          selectedCategory={settings.selectedCategory}
          showFavicons={settings.showFavicons}
        />
      )}
    </>
  );
};
