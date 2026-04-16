import type { SettingsFeedRowProps } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsFeedRow";
import type { UseSettingsDragReturn } from "@/app/dashboard/settings-state";
import type { CategoryTreeNode } from "@/lib/core";

export interface SettingsCategoryDraftFeedProps {
  isSavingFeed: boolean;
  newFeedName: string;
  newFeedUrl: string;
  onAddFeed: (categoryLabel: string) => void;
  onCancelAddFeed: () => void;
  onNewFeedNameChange: TextChangeHandler;
  onNewFeedUrlChange: TextChangeHandler;
}

export interface SettingsCategoryFeedListProps extends SharedFeedRowProps {
  categoryFeeds: CategoryTreeNode[];
  categoryLabel: string;
}

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

export type TextChangeHandler = (value: string) => void;
