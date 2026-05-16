"use client";

import type { SettingsFeedStateOptions } from "@/app/dashboard/settings-state/settingsFeedStateOptions";

import { useSettingsFeedEditorState } from "@/app/dashboard/settings-state/useSettingsFeedEditorState";
import { useSettingsOpmlImportState } from "@/app/dashboard/settings-state/useSettingsOpmlImportState";

/**
 * Manage the settings feed state.
 * @param options - The options used to manage the settings feed state.
 * @returns The settings feed state and callbacks.
 */
export function useSettingsFeedState(options: SettingsFeedStateOptions) {
  const {
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
  } = options;
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
