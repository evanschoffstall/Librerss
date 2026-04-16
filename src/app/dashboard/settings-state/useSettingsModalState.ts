"use client";

import type { SettingsFeedStateOptions } from "@/app/dashboard/settings-state/settingsFeedStateOptions";
import type { CategoryTreeNode } from "@/lib/core";

import { useSettingsCategoryState } from "@/app/dashboard/settings-state/useSettingsCategoryState";
import { useSettingsFeedState } from "@/app/dashboard/settings-state/useSettingsFeedState";

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
