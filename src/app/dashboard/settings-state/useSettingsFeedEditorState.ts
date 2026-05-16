"use client";

import { useEffect, useState } from "react";

import type { SettingsFeedStateOptions } from "@/app/dashboard/settings-state/settingsFeedStateOptions";
import type { CategoryTreeNode } from "@/lib/core";

import {
  useSettingsDrag,
  type UseSettingsDragReturn,
} from "@/app/dashboard/settings-state/useSettingsDrag";
import { isSameCategoryLabel } from "@/lib/utils";

/**
 * Describes the options for run with transient feed flag.
 */
interface RunWithTransientFeedFlagOptions<TResult> {
  run: () => Promise<TResult>;
  setValue: (value: boolean) => void;
}

/**
 * Describes the options for run with transient feed key.
 */
interface RunWithTransientFeedKeyOptions<TResult> {
  key: string;
  run: () => Promise<TResult>;
  setKey: (key: null | string) => void;
}

/**
 * Describes the options for settings feed editor actions.
 */
interface SettingsFeedEditorActionsOptions {
  onAddFeed: UseSettingsFeedEditorStateOptions["onAddFeed"];
  onRemoveFeed: UseSettingsFeedEditorStateOptions["onRemoveFeed"];
  onRenameFeed: UseSettingsFeedEditorStateOptions["onRenameFeed"];
  onSetFeedEnabled: UseSettingsFeedEditorStateOptions["onSetFeedEnabled"];
  onUpdateFeedSettings: UseSettingsFeedEditorStateOptions["onUpdateFeedSettings"];
  state: ReturnType<typeof useSettingsFeedEditorLocalState>;
}
/**
 * Describes the props for the settings shared feed row component.
 */
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

/**
 * Describes the options for shared feed row props.
 */
interface SharedFeedRowPropsOptions {
  actions: ReturnType<typeof useSettingsFeedEditorActions>;
  drag: ReturnType<typeof useSettingsDrag>;
  selectedCategory: string;
  state: ReturnType<typeof useSettingsFeedEditorLocalState>;
}

/**
 * Describes the options for use settings feed editor state.
 */
type UseSettingsFeedEditorStateOptions = Omit<
  SettingsFeedStateOptions,
  "onImportOpml"
>;

/**
 * Manage the settings feed editor state.
 * @param options - The options used to manage the settings feed editor state.
 * @returns The settings feed editor state and callbacks.
 */
export function useSettingsFeedEditorState(
  options: UseSettingsFeedEditorStateOptions,
) {
  const {
    categories,
    onAddFeed,
    onDropCategory,
    onDropFeed,
    onRemoveFeed,
    onRenameFeed,
    onSetFeedEnabled,
    onUpdateFeedSettings,
    selectedCategory,
  } = options;
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
     * Process the on cancel add feed.
     */
    onCancelAddFeed: () => {
      feedEditorState.setAddingFeedInCategory(null);
    },
    /**
     * Process the on toggle add feed.
     * @param label - The label.
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
 * Build the shared feed row props.
 * @param options - The options used to build the shared feed row props.
 * @returns The shared feed row props.
 */
function buildSharedFeedRowProps(
  options: SharedFeedRowPropsOptions,
): SettingsSharedFeedRowProps {
  const { actions, drag, selectedCategory, state } = options;
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
     * Process the on remove feed.
     * @param key - The key.
     */
    onRemoveFeed: (key: string) => {
      void actions.handleRemoveFeed(key);
    },
    /**
     * Process the on save feed rename.
     * @param key - The key.
     */
    onSaveFeedRename: (key: string) => {
      void actions.handleSaveFeedRename(key);
    },
    /**
     * Process the on start feed edit.
     * @param key - The key.
     * @param name - The name.
     * @param url - The url.
     */
    onStartFeedEdit: (key: string, name: string, url: string) => {
      state.setEditingFeedKey(key);
      state.setEditingFeedName(name);
      state.setEditingFeedUrl(url);
    },
    /**
     * Process the on toggle extraction disabled.
     * @param key - The key.
     * @param disabled - The disabled.
     */
    onToggleExtractionDisabled: (key: string, disabled: boolean) => {
      void actions.handleToggleExtractionDisabled(key, disabled);
    },
    /**
     * Process the on toggle feed enabled.
     * @param key - The key.
     * @param enabled - The enabled.
     */
    onToggleFeedEnabled: (key: string, enabled: boolean) => {
      void actions.handleToggleFeedEnabled(key, enabled);
    },
    /**
     * Process the on toggle proxy enabled.
     * @param key - The key.
     * @param enabled - The enabled.
     */
    onToggleProxyEnabled: (key: string, enabled: boolean) => {
      void actions.handleToggleProxyEnabled(key, enabled);
    },
    savingFeedKey: state.savingFeedKey,
    selectedCategory,
    togglingFeedKey: state.togglingFeedKey,
    updatingSettingsKey: state.updatingSettingsKey,
  };
}

/**
 * Create the feed settings toggle handler.
 * @param setKey - Callback that updates the active feed editor key.
 * @param onUpdateFeedSettings - Callback invoked when feed settings are saved.
 * @param settingKey - The setting key.
 * @returns The feed settings toggle handler.
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
 * Create the handle add feed.
 * @param state - The state.
 * @param onAddFeed - Callback invoked when a new feed source is added.
 * @returns The handle add feed.
 */
function createHandleAddFeed(
  state: ReturnType<typeof useSettingsFeedEditorLocalState>,
  onAddFeed: UseSettingsFeedEditorStateOptions["onAddFeed"],
) {
  return async (categoryLabel: string) => {
    await runWithTransientFeedFlag({
      /**
       * Process the run.
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
 * Create the handle save feed rename.
 * @param state - The state.
 * @param onRenameFeed - Callback invoked when a feed source is renamed.
 * @param clearFeedEdit - Callback that clears the current feed editor state.
 * @returns The handle save feed rename.
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
       * Process the run.
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
 * Create the transient feed key only handler.
 * @param setKey - Callback that updates the active feed editor key.
 * @param run - Async function to call with the feed key when the operation should run.
 * @returns The transient feed key only handler.
 */
function createTransientFeedKeyOnlyHandler(
  setKey: (key: null | string) => void,
  run: (feedKey: string) => Promise<unknown>,
) {
  return async (feedKey: string) => {
    await runWithTransientFeedKey({
      key: feedKey,
      /**
       * Process the run.
       * @returns The run.
       */
      run: () => run(feedKey),
      setKey,
    });
  };
}
/**
 * Create the transient feed key value handler.
 * @param setKey - Callback that updates the active feed editor key.
 * @param run - Async function to call with the feed key when the operation should run.
 * @returns The transient feed key value handler.
 */
function createTransientFeedKeyValueHandler<TValue>(
  setKey: (key: null | string) => void,
  run: (feedKey: string, value: TValue) => Promise<unknown>,
) {
  return async (feedKey: string, value: TValue) => {
    await runWithTransientFeedKey({
      key: feedKey,
      /**
       * Process the run.
       * @returns The run.
       */
      run: () => run(feedKey, value),
      setKey,
    });
  };
}

/**
 * Process the run with transient feed flag.
 * @param options - The options used to process the run with transient feed flag.
 * @returns The run with transient feed flag.
 */
async function runWithTransientFeedFlag<T>(
  options: RunWithTransientFeedFlagOptions<T>,
): Promise<T> {
  options.setValue(true);
  try {
    return await options.run();
  } finally {
    options.setValue(false);
  }
}
/**
 * Process the run with transient feed key.
 * @param options - The options used to process the run with transient feed key.
 * @returns The run with transient feed key.
 */
async function runWithTransientFeedKey<T>(
  options: RunWithTransientFeedKeyOptions<T>,
): Promise<T> {
  options.setKey(options.key);
  try {
    return await options.run();
  } finally {
    options.setKey(null);
  }
}

/**
 * Manage the settings feed editor actions.
 * @param options - The options used to manage the settings feed editor actions.
 * @returns The settings feed editor actions state and callbacks.
 */
function useSettingsFeedEditorActions(
  options: SettingsFeedEditorActionsOptions,
) {
  const {
    onAddFeed,
    onRemoveFeed,
    onRenameFeed,
    onSetFeedEnabled,
    onUpdateFeedSettings,
    state,
  } = options;
  /**
   * Process the clear feed edit.
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
 * Manage the settings feed editor local state.
 * @returns The settings feed editor local state and callbacks.
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
 * Manage the sync settings feed editor state.
 * @param categories - The categories.
 * @param state - The state.
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
