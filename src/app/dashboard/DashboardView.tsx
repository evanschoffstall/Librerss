"use client";

import { ArrowDown } from "lucide-react";

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
    <div className="
      mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4
      pt-[calc(env(safe-area-inset-top)+3.8rem)]
      pb-[env(safe-area-inset-bottom)]
      md:px-6
    ">
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
            <SheetTitle className="
              text-sm font-semibold tracking-tight text-foreground/90
            ">
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

      <DashboardTopTokenBar
        articleFilter={topBar.articleFilter}
        lastRefreshLabel={topBar.lastRefreshLabel}
        loading={topBar.loading}
        onArticleFilterChange={topBar.setArticleFilter}
      />

      <div className="
        flex min-h-0 flex-1 flex-col gap-6 overflow-hidden
        lg:flex-row lg:items-stretch lg:gap-0
      ">
        <aside className="
          hidden min-h-0 overflow-hidden
          lg:block lg:w-[220px] lg:shrink-0
        ">
          <div className="h-full rounded-xl bg-card/35 p-2">
            <ScrollArea
              className={`
                anim-duration-ui anim-ease-ui h-full transition-opacity
                ${
                sidebar.sidebarProps.isCategoriesLoading ||
                sidebar.isSidebarVisible
                  ? "opacity-100"
                  : "opacity-0"
              }
              `}
              ref={sidebar.sidebarScrollRef}
            >
              <DashboardSidebarContent {...sidebar.sidebarProps} />
            </ScrollArea>
          </div>
        </aside>

        <section className="
          min-h-0 flex-1 overflow-hidden
          lg:min-w-0
        ">
          <ScrollArea className="h-full" ref={feedList.mergedFeedScrollRef}>
            <div className="p-1" ref={feedList.feedWrapperRef}>
              {/* Pull sentinel: fixed-height scroll item, hidden by scrollTop on mount.
                  Scrolling into it = native pull gesture. */}
              <div
                className={`
                  mb-2 flex items-end justify-center bg-background
                  transition-colors duration-150
                  ${
                  feedList.isPulling
                    ? feedList.readyToRefresh
                      ? "bg-sky-500/25"
                      : "bg-sky-500/10"
                    : ""
                }
                `}
                ref={feedList.pullSentinelRef}
                style={{ height: feedList.sentinelHeight }}
              >
                {feedList.isPulling && (
                  <div className="
                    flex items-center gap-1.5 pb-3 text-sky-600
                    dark:text-sky-400
                  ">
                    <ArrowDown
                      className={`
                        size-4 transition-transform duration-150
                        ${
                        feedList.readyToRefresh
                          ? "scale-110 rotate-180"
                          : "scale-90 opacity-60"
                      }
                      `}
                    />
                    <span
                      className={`
                        text-xs font-medium transition-opacity duration-150
                        ${
                        feedList.readyToRefresh ? "opacity-100" : "opacity-70"
                      }
                      `}
                    >
                      {feedList.pullRefreshHint}
                    </span>
                  </div>
                )}
              </div>
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
            </div>
          </ScrollArea>
        </section>
      </div>

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
    </div>
  );
};
