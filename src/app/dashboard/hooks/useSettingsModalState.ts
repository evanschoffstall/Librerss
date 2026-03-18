"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  type CategoryTreeNode,
  DEFAULT_CATEGORY_LABEL,
  isSameCategoryLabel,
  type OpmlFeedImportEntry,
  parseOpmlFeedImport,
} from "@/lib";

import { useSettingsDrag, type UseSettingsDragReturn } from "./useSettingsDrag";

interface SharedFeedRowProps {
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

interface UseSettingsModalStateOptions {
  categories: CategoryTreeNode[];
  categoryOptions: string[];
  onAddCategory: (name: string) => boolean;
  onAddFeed: (name: string, url: string, category: string) => Promise<boolean>;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
  onDropFeed: (
    key: string,
    targetCategory: string,
    targetIndex: number,
  ) => Promise<void>;
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
  onRemoveFeed: (key: string) => Promise<void>;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
  onRenameFeed: (key: string, name: string, url: string) => Promise<boolean>;
  onSetFeedEnabled: (key: string, enabled: boolean) => Promise<boolean>;
  onUpdateFeedSettings: (
    key: string,
    settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
  ) => Promise<boolean>;
  selectedCategory: string;
}

export function useSettingsModalState({
  categories,
  categoryOptions,
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
  // ── Add-feed form state ───────────────────────────────────────────────────
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newFeedCategory, setNewFeedCategory] = useState(
    categoryOptions[0] ?? DEFAULT_CATEGORY_LABEL,
  );
  const [addingFeedInCategory, setAddingFeedInCategory] = useState<
    null | string
  >(null);
  const [isSavingFeed, setIsSavingFeed] = useState(false);

  // ── Category edit state ───────────────────────────────────────────────────
  const [editingCategory, setEditingCategory] = useState<null | string>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [savingCategoryLabel, setSavingCategoryLabel] = useState<null | string>(
    null,
  );

  // ── Feed edit state ───────────────────────────────────────────────────────
  const [editingFeedKey, setEditingFeedKey] = useState<null | string>(null);
  const [editingFeedName, setEditingFeedName] = useState("");
  const [editingFeedUrl, setEditingFeedUrl] = useState("");
  const [savingFeedKey, setSavingFeedKey] = useState<null | string>(null);
  const [deletingKey, setDeletingKey] = useState<null | string>(null);
  const [togglingFeedKey, setTogglingFeedKey] = useState<null | string>(null);
  const [updatingSettingsKey, setUpdatingSettingsKey] = useState<null | string>(
    null,
  );

  // ── Drag state ────────────────────────────────────────────────────────────
  const drag = useSettingsDrag({ onDropCategory, onDropFeed });

  // ── OPML state ────────────────────────────────────────────────────────────
  const [isImportingOpml, setIsImportingOpml] = useState(false);
  const opmlInputRef = useRef<HTMLInputElement | null>(null);

  // Keep default category in sync when options change
  useEffect(() => {
    if (!categoryOptions.includes(newFeedCategory)) {
      setNewFeedCategory(categoryOptions[0] ?? DEFAULT_CATEGORY_LABEL);
    }
  }, [categoryOptions, newFeedCategory]);

  // Clear stale editing state when categories change
  useEffect(() => {
    if (
      addingFeedInCategory &&
      !categories.some((n) =>
        isSameCategoryLabel(n.label, addingFeedInCategory),
      )
    ) {
      setAddingFeedInCategory(null);
    }
    if (
      editingCategory &&
      !categories.some((n) => isSameCategoryLabel(n.label, editingCategory))
    ) {
      setEditingCategory(null);
      setEditingCategoryName("");
    }
    if (
      editingFeedKey &&
      !categories.some((n) =>
        (n.children ?? []).some(
          (f: CategoryTreeNode) => f.key === editingFeedKey,
        ),
      )
    ) {
      setEditingFeedKey(null);
      setEditingFeedName("");
      setEditingFeedUrl("");
    }
  }, [categories, addingFeedInCategory, editingCategory, editingFeedKey]);

  // ── Feed handlers ─────────────────────────────────────────────────────────

  const clearFeedEdit = () => {
    setEditingFeedKey(null);
    setEditingFeedName("");
    setEditingFeedUrl("");
  };

  const clearCategoryEdit = () => {
    setEditingCategory(null);
    setEditingCategoryName("");
  };

  const handleAddFeed = async (categoryLabel: string) => {
    setIsSavingFeed(true);
    try {
      const didSave = await onAddFeed(
        newFeedName.trim(),
        newFeedUrl.trim(),
        categoryLabel,
      );
      if (!didSave) return;
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
      if (!didSave) return;
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

  // ── Category handlers ─────────────────────────────────────────────────────

  const handleAddCategory = () => {
    const didAdd = onAddCategory(newCategoryName.trim());
    if (!didAdd) return;
    setNewCategoryName("");
  };

  const handleSaveCategoryRename = async (currentLabel: string) => {
    setSavingCategoryLabel(currentLabel);
    try {
      const didSave = await onRenameCategory(
        currentLabel,
        editingCategoryName.trim(),
      );
      if (!didSave) return;
      clearCategoryEdit();
    } finally {
      setSavingCategoryLabel(null);
    }
  };

  // ── OPML handler ──────────────────────────────────────────────────────────

  const handleOpmlFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setIsImportingOpml(true);
    try {
      const content = await file.text();
      const entries = parseOpmlFeedImport(content);
      if (entries.length === 0) {
        toast.error("No valid feeds found in this OPML file.");
        return;
      }
      await onImportOpml(entries);
    } catch (error) {
      console.error("OPML import parse error:", error);
      toast.error("Unable to import this OPML file.");
    } finally {
      setIsImportingOpml(false);
    }
  };

  // ── Shared feed-row props ─────────────────────────────────────────────────

  const sharedFeedRowProps: SharedFeedRowProps = {
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
    editingCategory,
    editingCategoryName,
    handleAddCategory,
    // Handlers
    handleAddFeed,
    handleOpmlFileChange,
    handleSaveCategoryRename,
    isImportingOpml,
    isSavingFeed,
    newCategoryName,
    // State
    newFeedName,
    newFeedUrl,
    onCancelAddFeed: () => {
      setAddingFeedInCategory(null);
    },
    onCancelCategoryEdit: clearCategoryEdit,
    // Callbacks
    onStartCategoryEdit: (label: string) => {
      setEditingCategory(label);
      setEditingCategoryName(label);
    },
    onToggleAddFeed: (label: string) => {
      setAddingFeedInCategory(addingFeedInCategory === label ? null : label);
      setNewFeedName("");
      setNewFeedUrl("");
    },
    opmlInputRef,
    savingCategoryLabel,
    setAddingFeedInCategory,
    setEditingCategoryName,
    setNewCategoryName,
    setNewFeedName,
    setNewFeedUrl,
    sharedFeedRowProps,
  };
}
