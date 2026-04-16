"use client";

import type { useDashboardController } from "@/app/dashboard/dashboard-hooks/dashboard-controller";

import { SettingsPanel } from "@/app/dashboard/dashboard-components/settings-dialog";

type DashboardSettings = ReturnType<typeof useDashboardController>["settings"];

export function DashboardSettingsModal({
  settings,
}: {
  settings: DashboardSettings;
}) {
  if (!settings.showSettingsModal) {
    return null;
  }

  return (
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
  );
}
