"use client";

import type { SettingsFeedStateOptions } from "@/app/dashboard/settings-state/settingsFeedStateOptions";

import { useSettingsFeedEditorState } from "@/app/dashboard/settings-state/useSettingsFeedEditorState";
import { useSettingsOpmlImportState } from "@/app/dashboard/settings-state/useSettingsOpmlImportState";

/**
 * Composes feed editing with OPML import state for the settings modal.
 * @param root0
 * @param root0.categories
 * @param root0.onAddFeed
 * @param root0.onDropCategory
 * @param root0.onDropFeed
 * @param root0.onImportOpml
 * @param root0.onRemoveFeed
 * @param root0.onRenameFeed
 * @param root0.onSetFeedEnabled
 * @param root0.onUpdateFeedSettings
 * @param root0.selectedCategory
 */
export function useSettingsFeedState({
  categories,
  onAddFeed,
  onDropCategory,
  onDropFeed,
  onImportOpml,
  onRemoveFeed,
  onRenameFeed,
  onSetFeedEnabled,
  onUpdateFeedSettings,
  selectedCategory,
}: SettingsFeedStateOptions) {
  const feedEditorState = useSettingsFeedEditorState({
    categories,
    onAddFeed,
    onDropCategory,
    onDropFeed,
    onRemoveFeed,
    onRenameFeed,
    onSetFeedEnabled,
    onUpdateFeedSettings,
    selectedCategory,
  });
  const opmlImportState = useSettingsOpmlImportState({ onImportOpml });

  return {
    ...feedEditorState,
    ...opmlImportState,
  };
}
