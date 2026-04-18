"use client";

import { useEffect, useState } from "react";

import type { SettingsFeedStateOptions } from "@/app/dashboard/settings-state/settingsFeedStateOptions";
import type { CategoryTreeNode } from "@/lib/core";

import {
  useSettingsDrag,
  type UseSettingsDragReturn,
} from "@/app/dashboard/settings-state/useSettingsDrag";
import { isSameCategoryLabel } from "@/lib/utils";

interface SettingsSharedFeedRowProps {
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
 * @param root0
 * @param root0.categories
 * @param root0.onAddFeed
 * @param root0.onDropCategory
 * @param root0.onDropFeed
 * @param root0.onRemoveFeed
 * @param root0.onRenameFeed
 * @param root0.onSetFeedEnabled
 * @param root0.onUpdateFeedSettings
 * @param root0.selectedCategory
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
  const feedEditorState = useSettingsFeedEditorLocalState();
  const drag = useSettingsDrag({ onDropCategory, onDropFeed });
  useSyncSettingsFeedEditorState(categories, feedEditorState);
  const actions = useSettingsFeedEditorActions({
    onAddFeed,
    onRemoveFeed,
    onRenameFeed,
    onSetFeedEnabled,
    onUpdateFeedSettings,
    state: feedEditorState,
  });
  const sharedFeedRowProps = buildSharedFeedRowProps({
    actions,
    drag,
    selectedCategory,
    state: feedEditorState,
  });

  return {
    addingFeedInCategory: feedEditorState.addingFeedInCategory,
    drag,
    handleAddFeed: actions.handleAddFeed,
    isSavingFeed: feedEditorState.isSavingFeed,
    newFeedName: feedEditorState.newFeedName,
    newFeedUrl: feedEditorState.newFeedUrl,
    /**
     *
     */
    onCancelAddFeed: () => {
      feedEditorState.setAddingFeedInCategory(null);
    },
    /**
     * @param label
     */
    onToggleAddFeed: (label: string) => {
      feedEditorState.setAddingFeedInCategory(
        feedEditorState.addingFeedInCategory === label ? null : label,
      );
      feedEditorState.setNewFeedName("");
      feedEditorState.setNewFeedUrl("");
    },
    setNewFeedName: feedEditorState.setNewFeedName,
    setNewFeedUrl: feedEditorState.setNewFeedUrl,
    sharedFeedRowProps,
  };
}

/**
 * @param root0
 * @param root0.actions
 * @param root0.drag
 * @param root0.selectedCategory
 * @param root0.state
 */
function buildSharedFeedRowProps({
  actions,
  drag,
  selectedCategory,
  state,
}: {
  actions: ReturnType<typeof useSettingsFeedEditorActions>;
  drag: ReturnType<typeof useSettingsDrag>;
  selectedCategory: string;
  state: ReturnType<typeof useSettingsFeedEditorLocalState>;
}): SettingsSharedFeedRowProps {
  return {
    deletingKey: state.deletingKey,
    draggingFeedKey: drag.draggingFeedKey,
    editingFeedKey: state.editingFeedKey,
    editingFeedName: state.editingFeedName,
    editingFeedUrl: state.editingFeedUrl,
    feedDropTarget: drag.feedDropTarget,
    movingFeedKey: drag.movingFeedKey,
    onCancelFeedEdit: actions.clearFeedEdit,
    onEditingFeedNameChange: state.setEditingFeedName,
    onEditingFeedUrlChange: state.setEditingFeedUrl,
    onFeedDragEnd: drag.onFeedDragEnd,
    onFeedDragOver: drag.onFeedDragOver,
    onFeedDragStart: drag.onFeedDragStart,
    onFeedDrop: drag.onFeedDrop,
    /**
     * @param key
     */
    onRemoveFeed: (key: string) => void actions.handleRemoveFeed(key),
    /**
     * @param key
     */
    onSaveFeedRename: (key: string) => void actions.handleSaveFeedRename(key),
    /**
     * @param key
     * @param name
     * @param url
     */
    onStartFeedEdit: (key: string, name: string, url: string) => {
      state.setEditingFeedKey(key);
      state.setEditingFeedName(name);
      state.setEditingFeedUrl(url);
    },
    /**
     * @param key
     * @param disabled
     */
    onToggleExtractionDisabled: (key: string, disabled: boolean) =>
      void actions.handleToggleExtractionDisabled(key, disabled),
    /**
     * @param key
     * @param enabled
     */
    onToggleFeedEnabled: (key: string, enabled: boolean) =>
      void actions.handleToggleFeedEnabled(key, enabled),
    /**
     * @param key
     * @param enabled
     */
    onToggleProxyEnabled: (key: string, enabled: boolean) =>
      void actions.handleToggleProxyEnabled(key, enabled),
    savingFeedKey: state.savingFeedKey,
    selectedCategory,
    togglingFeedKey: state.togglingFeedKey,
    updatingSettingsKey: state.updatingSettingsKey,
  };
}

/**
 * @param setKey
 * @param onUpdateFeedSettings
 * @param settingKey
 */
function createFeedSettingsToggleHandler(
  setKey: (key: null | string) => void,
  onUpdateFeedSettings: UseSettingsFeedEditorStateOptions["onUpdateFeedSettings"],
  settingKey: "extractionDisabled" | "proxyEnabled",
) {
  return createTransientFeedKeyValueHandler(
    setKey,
    (feedKey, enabled: boolean) =>
      onUpdateFeedSettings(feedKey, { [settingKey]: enabled }),
  );
}

/**
 * @param state
 * @param onAddFeed
 */
function createHandleAddFeed(
  state: ReturnType<typeof useSettingsFeedEditorLocalState>,
  onAddFeed: UseSettingsFeedEditorStateOptions["onAddFeed"],
) {
  return async (categoryLabel: string) => {
    await runWithTransientFeedFlag({
      /**
       *
       */
      run: async () => {
        const didSave = await onAddFeed(
          state.newFeedName.trim(),
          state.newFeedUrl.trim(),
          categoryLabel,
        );
        if (!didSave) return;
        state.setNewFeedName("");
        state.setNewFeedUrl("");
        state.setAddingFeedInCategory(null);
      },
      setValue: state.setIsSavingFeed,
    });
  };
}

/**
 * @param state
 * @param onRenameFeed
 * @param clearFeedEdit
 */
function createHandleSaveFeedRename(
  state: ReturnType<typeof useSettingsFeedEditorLocalState>,
  onRenameFeed: UseSettingsFeedEditorStateOptions["onRenameFeed"],
  clearFeedEdit: () => void,
) {
  return async (feedKey: string) => {
    await runWithTransientFeedKey({
      key: feedKey,
      /**
       *
       */
      run: async () => {
        const didSave = await onRenameFeed(
          feedKey,
          state.editingFeedName.trim(),
          state.editingFeedUrl.trim(),
        );
        if (!didSave) return;
        clearFeedEdit();
      },
      setKey: state.setSavingFeedKey,
    });
  };
}

/**
 * @param setKey
 * @param run
 */
function createTransientFeedKeyOnlyHandler(
  setKey: (key: null | string) => void,
  run: (feedKey: string) => Promise<unknown>,
) {
  return async (feedKey: string) => {
    await runWithTransientFeedKey({
      key: feedKey,
      /**
       *
       */
      run: () => run(feedKey),
      setKey,
    });
  };
}

/**
 * @param setKey
 * @param run
 */
function createTransientFeedKeyValueHandler<TValue>(
  setKey: (key: null | string) => void,
  run: (feedKey: string, value: TValue) => Promise<unknown>,
) {
  return async (feedKey: string, value: TValue) => {
    await runWithTransientFeedKey({
      key: feedKey,
      /**
       *
       */
      run: () => run(feedKey, value),
      setKey,
    });
  };
}

/**
 * @param options
 * @param options.run
 * @param options.setValue
 */
async function runWithTransientFeedFlag<T>(options: {
  run: () => Promise<T>;
  setValue: (value: boolean) => void;
}) {
  options.setValue(true);
  try {
    return await options.run();
  } finally {
    options.setValue(false);
  }
}

/**
 * @param options
 * @param options.key
 * @param options.run
 * @param options.setKey
 */
async function runWithTransientFeedKey<T>(options: {
  key: string;
  run: () => Promise<T>;
  setKey: (key: null | string) => void;
}) {
  options.setKey(options.key);
  try {
    return await options.run();
  } finally {
    options.setKey(null);
  }
}

/**
 * @param root0
 * @param root0.onAddFeed
 * @param root0.onRemoveFeed
 * @param root0.onRenameFeed
 * @param root0.onSetFeedEnabled
 * @param root0.onUpdateFeedSettings
 * @param root0.state
 */
function useSettingsFeedEditorActions({
  onAddFeed,
  onRemoveFeed,
  onRenameFeed,
  onSetFeedEnabled,
  onUpdateFeedSettings,
  state,
}: {
  onAddFeed: UseSettingsFeedEditorStateOptions["onAddFeed"];
  onRemoveFeed: UseSettingsFeedEditorStateOptions["onRemoveFeed"];
  onRenameFeed: UseSettingsFeedEditorStateOptions["onRenameFeed"];
  onSetFeedEnabled: UseSettingsFeedEditorStateOptions["onSetFeedEnabled"];
  onUpdateFeedSettings: UseSettingsFeedEditorStateOptions["onUpdateFeedSettings"];
  state: ReturnType<typeof useSettingsFeedEditorLocalState>;
}) {
  /**
   *
   */
  const clearFeedEdit = () => {
    state.setEditingFeedKey(null);
    state.setEditingFeedName("");
    state.setEditingFeedUrl("");
  };

  return {
    clearFeedEdit,
    handleAddFeed: createHandleAddFeed(state, onAddFeed),
    handleRemoveFeed: createTransientFeedKeyOnlyHandler(
      state.setDeletingKey,
      onRemoveFeed,
    ),
    handleSaveFeedRename: createHandleSaveFeedRename(
      state,
      onRenameFeed,
      clearFeedEdit,
    ),
    handleToggleExtractionDisabled: createFeedSettingsToggleHandler(
      state.setUpdatingSettingsKey,
      onUpdateFeedSettings,
      "extractionDisabled",
    ),
    handleToggleFeedEnabled: createTransientFeedKeyValueHandler(
      state.setTogglingFeedKey,
      onSetFeedEnabled,
    ),
    handleToggleProxyEnabled: createFeedSettingsToggleHandler(
      state.setUpdatingSettingsKey,
      onUpdateFeedSettings,
      "proxyEnabled",
    ),
  };
}

/**
 *
 */
function useSettingsFeedEditorLocalState() {
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

  return {
    addingFeedInCategory,
    deletingKey,
    editingFeedKey,
    editingFeedName,
    editingFeedUrl,
    isSavingFeed,
    newFeedName,
    newFeedUrl,
    savingFeedKey,
    setAddingFeedInCategory,
    setDeletingKey,
    setEditingFeedKey,
    setEditingFeedName,
    setEditingFeedUrl,
    setIsSavingFeed,
    setNewFeedName,
    setNewFeedUrl,
    setSavingFeedKey,
    setTogglingFeedKey,
    setUpdatingSettingsKey,
    togglingFeedKey,
    updatingSettingsKey,
  };
}

/**
 * @param categories
 * @param state
 */
function useSyncSettingsFeedEditorState(
  categories: CategoryTreeNode[],
  state: ReturnType<typeof useSettingsFeedEditorLocalState>,
) {
  useEffect(() => {
    if (
      state.addingFeedInCategory &&
      !categories.some((categoryNode) =>
        isSameCategoryLabel(categoryNode.label, state.addingFeedInCategory),
      )
    ) {
      state.setAddingFeedInCategory(null);
    }

    if (
      state.editingFeedKey &&
      !categories.some((categoryNode) =>
        (categoryNode.children ?? []).some(
          (feedNode: CategoryTreeNode) => feedNode.key === state.editingFeedKey,
        ),
      )
    ) {
      state.setEditingFeedKey(null);
      state.setEditingFeedName("");
      state.setEditingFeedUrl("");
    }
  }, [categories, state]);
}
