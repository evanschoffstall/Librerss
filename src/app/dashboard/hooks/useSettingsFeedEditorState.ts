"use client";

import { useEffect, useState } from "react";

import { type CategoryTreeNode, isSameCategoryLabel } from "@/lib";

import {
  type SettingsFeedStateOptions,
} from "./settings-feed-state.types";
import { useSettingsDrag, type UseSettingsDragReturn } from "./useSettingsDrag";

export interface SettingsSharedFeedRowProps {
  deletingKey: null | string;
  draggingFeedKey: UseSettingsDragReturn["draggingFeedKey"];
  editingFeedKey: null | string;
  editingFeedName: string;
  editingFeedUrl: string;
  feedDropTarget: UseSettingsDragReturn["feedDropTarget"];
  movingFeedKey: UseSettingsDragReturn["movingFeedKey"];
  onCancelFeedEdit: () => void;
  onEditingFeedNameChange: (value: string) => void;
  onEditingFeedUrlChange: (value: string) => void;
  onFeedDragEnd: UseSettingsDragReturn["onFeedDragEnd"];
  onFeedDragOver: UseSettingsDragReturn["onFeedDragOver"];
  onFeedDragStart: UseSettingsDragReturn["onFeedDragStart"];
  onFeedDrop: UseSettingsDragReturn["onFeedDrop"];
  onRemoveFeed: (key: string) => void;
  onSaveFeedRename: (key: string) => void;
  onStartFeedEdit: (key: string, name: string, url: string) => void;
  onToggleExtractionDisabled: (key: string, disabled: boolean) => void;
  onToggleFeedEnabled: (key: string, enabled: boolean) => void;
  onToggleProxyEnabled: (key: string, enabled: boolean) => void;
  savingFeedKey: null | string;
  selectedCategory: string;
  togglingFeedKey: null | string;
  updatingSettingsKey: null | string;
}

type UseSettingsFeedEditorStateOptions = Omit<
  SettingsFeedStateOptions,
  "onImportOpml"
>;

/**
 * Owns feed row editing, enablement toggles, add-feed drafts, and drag state.
 *
 * Separating these concerns from OPML import keeps the mutable feed-management
 * path small enough to reason about independently.
 */
export function useSettingsFeedEditorState({
  categories,
  onAddFeed,
  onDropCategory,
  onDropFeed,
  onRemoveFeed,
  onRenameFeed,
  onSetFeedEnabled,
  onUpdateFeedSettings,
  selectedCategory,
}: UseSettingsFeedEditorStateOptions) {
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [addingFeedInCategory, setAddingFeedInCategory] = useState<
    null | string
  >(null);
  const [isSavingFeed, setIsSavingFeed] = useState(false);
  const [editingFeedKey, setEditingFeedKey] = useState<null | string>(null);
  const [editingFeedName, setEditingFeedName] = useState("");
  const [editingFeedUrl, setEditingFeedUrl] = useState("");
  const [savingFeedKey, setSavingFeedKey] = useState<null | string>(null);
  const [deletingKey, setDeletingKey] = useState<null | string>(null);
  const [togglingFeedKey, setTogglingFeedKey] = useState<null | string>(null);
  const [updatingSettingsKey, setUpdatingSettingsKey] = useState<null | string>(
    null,
  );
  const drag = useSettingsDrag({ onDropCategory, onDropFeed });

  useEffect(() => {
    if (
      addingFeedInCategory &&
      !categories.some((categoryNode) =>
        isSameCategoryLabel(categoryNode.label, addingFeedInCategory),
      )
    ) {
      setAddingFeedInCategory(null);
    }

    if (
      editingFeedKey &&
      !categories.some((categoryNode) =>
        (categoryNode.children ?? []).some(
          (feedNode: CategoryTreeNode) => feedNode.key === editingFeedKey,
        ),
      )
    ) {
      setEditingFeedKey(null);
      setEditingFeedName("");
      setEditingFeedUrl("");
    }
  }, [addingFeedInCategory, categories, editingFeedKey]);

  const clearFeedEdit = () => {
    setEditingFeedKey(null);
    setEditingFeedName("");
    setEditingFeedUrl("");
  };

  const handleAddFeed = async (categoryLabel: string) => {
    setIsSavingFeed(true);
    try {
      const didSave = await onAddFeed(
        newFeedName.trim(),
        newFeedUrl.trim(),
        categoryLabel,
      );
      if (!didSave) {
        return;
      }

      setNewFeedName("");
      setNewFeedUrl("");
      setAddingFeedInCategory(null);
    } finally {
      setIsSavingFeed(false);
    }
  };

  const handleRemoveFeed = async (key: string) => {
    setDeletingKey(key);
    try {
      await onRemoveFeed(key);
    } finally {
      setDeletingKey(null);
    }
  };

  const handleSaveFeedRename = async (feedKey: string) => {
    setSavingFeedKey(feedKey);
    try {
      const didSave = await onRenameFeed(
        feedKey,
        editingFeedName.trim(),
        editingFeedUrl.trim(),
      );
      if (!didSave) {
        return;
      }

      clearFeedEdit();
    } finally {
      setSavingFeedKey(null);
    }
  };

  const handleToggleFeedEnabled = async (feedKey: string, enabled: boolean) => {
    setTogglingFeedKey(feedKey);
    try {
      await onSetFeedEnabled(feedKey, enabled);
    } finally {
      setTogglingFeedKey(null);
    }
  };

  const handleToggleExtractionDisabled = async (
    feedKey: string,
    disabled: boolean,
  ) => {
    setUpdatingSettingsKey(feedKey);
    try {
      await onUpdateFeedSettings(feedKey, { extractionDisabled: disabled });
    } finally {
      setUpdatingSettingsKey(null);
    }
  };

  const handleToggleProxyEnabled = async (
    feedKey: string,
    enabled: boolean,
  ) => {
    setUpdatingSettingsKey(feedKey);
    try {
      await onUpdateFeedSettings(feedKey, { proxyEnabled: enabled });
    } finally {
      setUpdatingSettingsKey(null);
    }
  };

  const sharedFeedRowProps: SettingsSharedFeedRowProps = {
    deletingKey,
    draggingFeedKey: drag.draggingFeedKey,
    editingFeedKey,
    editingFeedName,
    editingFeedUrl,
    feedDropTarget: drag.feedDropTarget,
    movingFeedKey: drag.movingFeedKey,
    onCancelFeedEdit: clearFeedEdit,
    onEditingFeedNameChange: setEditingFeedName,
    onEditingFeedUrlChange: setEditingFeedUrl,
    onFeedDragEnd: drag.onFeedDragEnd,
    onFeedDragOver: drag.onFeedDragOver,
    onFeedDragStart: drag.onFeedDragStart,
    onFeedDrop: drag.onFeedDrop,
    onRemoveFeed: (key: string) => void handleRemoveFeed(key),
    onSaveFeedRename: (key: string) => void handleSaveFeedRename(key),
    onStartFeedEdit: (key: string, name: string, url: string) => {
      setEditingFeedKey(key);
      setEditingFeedName(name);
      setEditingFeedUrl(url);
    },
    onToggleExtractionDisabled: (key: string, disabled: boolean) =>
      void handleToggleExtractionDisabled(key, disabled),
    onToggleFeedEnabled: (key: string, enabled: boolean) =>
      void handleToggleFeedEnabled(key, enabled),
    onToggleProxyEnabled: (key: string, enabled: boolean) =>
      void handleToggleProxyEnabled(key, enabled),
    savingFeedKey,
    selectedCategory,
    togglingFeedKey,
    updatingSettingsKey,
  };

  return {
    addingFeedInCategory,
    drag,
    handleAddFeed,
    isSavingFeed,
    newFeedName,
    newFeedUrl,
    onCancelAddFeed: () => {
      setAddingFeedInCategory(null);
    },
    onToggleAddFeed: (label: string) => {
      setAddingFeedInCategory(addingFeedInCategory === label ? null : label);
      setNewFeedName("");
      setNewFeedUrl("");
    },
    setNewFeedName,
    setNewFeedUrl,
    sharedFeedRowProps,
  };
}