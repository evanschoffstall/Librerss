import type { SettingsFeedRowProps } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsFeedRow";
import type { UseSettingsDragReturn } from "@/app/dashboard/settings-state";
import type { CategoryTreeNode } from "@/lib/core";

/**
 * Describes the props for the settings category draft feed component.
 */
export interface SettingsCategoryDraftFeedProps {
  isSavingFeed: boolean;
  newFeedName: string;
  newFeedUrl: string;
  onAddFeed: (categoryLabel: string) => void;
  onCancelAddFeed: () => void;
  onNewFeedNameChange: TextChangeHandler;
  onNewFeedUrlChange: TextChangeHandler;
}

/**
 * Describes the props for the settings category feed list component.
 */
export interface SettingsCategoryFeedListProps extends SharedFeedRowProps {
  categoryFeeds: CategoryTreeNode[];
  categoryLabel: string;
}

/**
 * Describes the settings category header callbacks.
 */
export interface SettingsCategoryHeaderCallbacks {
  onCancelCategoryEdit: () => void;
  onCategoryDragEnd: () => void;
  onCategoryDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    label: string,
  ) => void;
  onEditingCategoryNameChange: TextChangeHandler;
  onRemoveCategory: (label: string) => void;
  onSaveCategoryRename: (label: string) => void;
  onStartCategoryEdit: (label: string) => void;
  onToggleAddFeed: (label: string) => void;
  savingCategoryLabel: null | string;
}

/**
 * Describes the props for the shared feed row component.
 */
export type SharedFeedRowProps = Omit<
  SettingsFeedRowProps,
  | "categoryLabel"
  | "feedNode"
  | "index"
  | "onCancelRename"
  | "onDragEnd"
  | "onDragOver"
  | "onDragStart"
  | "onDrop"
  | "onEditingNameChange"
  | "onEditingUrlChange"
  | "onRemove"
  | "onSaveRename"
  | "onStartEditing"
  | "onToggleEnabled"
> & {
  onCancelFeedEdit: SettingsFeedRowProps["onCancelRename"];
  onEditingFeedNameChange: SettingsFeedRowProps["onEditingNameChange"];
  onEditingFeedUrlChange: SettingsFeedRowProps["onEditingUrlChange"];
  onFeedDragEnd: UseSettingsDragReturn["onFeedDragEnd"];
  onFeedDragOver: UseSettingsDragReturn["onFeedDragOver"];
  onFeedDragStart: UseSettingsDragReturn["onFeedDragStart"];
  onFeedDrop: UseSettingsDragReturn["onFeedDrop"];
  onRemoveFeed: SettingsFeedRowProps["onRemove"];
  onSaveFeedRename: SettingsFeedRowProps["onSaveRename"];
  onStartFeedEdit: SettingsFeedRowProps["onStartEditing"];
  onToggleFeedEnabled: SettingsFeedRowProps["onToggleEnabled"];
};

/**
 * Defines the text change handler type.
 */
export type TextChangeHandler = (value: string) => void;
