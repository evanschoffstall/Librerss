"use client";

import type { SettingsFeedStateOptions } from "@/app/dashboard/settings-state/settingsFeedStateOptions";

import { useSettingsFeedEditorState } from "@/app/dashboard/settings-state/useSettingsFeedEditorState";
import { useSettingsOpmlImportState } from "@/app/dashboard/settings-state/useSettingsOpmlImportState";

/** Composes feed editing with OPML import state for the settings modal. */
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
