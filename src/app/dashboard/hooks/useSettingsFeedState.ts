"use client";

import { type SettingsFeedStateOptions } from "./settings-feed.contracts";
import { useSettingsFeedEditorState } from "./useSettingsFeedEditorState";
import { useSettingsOpmlImportState } from "./useSettingsOpmlImportState";

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