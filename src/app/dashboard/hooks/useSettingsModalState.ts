"use client";

import { type CategoryTreeNode } from "@/lib";

import { type SettingsFeedStateOptions } from "./settings-feed-state.types";
import { useSettingsCategoryState } from "./useSettingsCategoryState";
import { useSettingsFeedState } from "./useSettingsFeedState";

export type SettingsModalState = ReturnType<typeof useSettingsModalState>;

interface UseSettingsModalStateOptions extends SettingsFeedStateOptions {
  categories: CategoryTreeNode[];
  onAddCategory: (name: string) => boolean;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
}

export function useSettingsModalState({
  categories,
  onAddCategory,
  onAddFeed,
  onDropCategory,
  onDropFeed,
  onImportOpml,
  onRemoveFeed,
  onRenameCategory,
  onRenameFeed,
  onSetFeedEnabled,
  onUpdateFeedSettings,
  selectedCategory,
}: UseSettingsModalStateOptions) {
  const categoryState = useSettingsCategoryState({
    categories,
    onAddCategory,
    onRenameCategory,
  });
  const feedState = useSettingsFeedState({
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
  });

  return {
    ...categoryState,
    ...feedState,
  };
}
