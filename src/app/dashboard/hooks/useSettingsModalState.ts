"use client";

import {
  DEFAULT_CATEGORY_LABEL,
  isSameCategoryLabel,
  parseOpmlFeedImport,
  type CategoryTreeNode,
  type OpmlFeedImportEntry,
} from "@/lib";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSettingsDrag, type UseSettingsDragReturn } from "./useSettingsDrag";

interface UseSettingsModalStateOptions {
  categories: CategoryTreeNode[];
  categoryOptions: string[];
  selectedCategory: string;
  onImportOpml: (entries: OpmlFeedImportEntry[]) => Promise<void>;
  onDropFeed: (
    key: string,
    targetCategory: string,
    targetIndex: number,
  ) => Promise<void>;
  onAddFeed: (name: string, url: string, category: string) => Promise<boolean>;
  onAddCategory: (name: string) => boolean;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
  onDropCategory: (label: string, targetIndex: number) => Promise<void>;
  onRemoveFeed: (key: string) => Promise<void>;
  onRenameFeed: (key: string, name: string, url: string) => Promise<boolean>;
  onSetFeedEnabled: (key: string, enabled: boolean) => Promise<boolean>;
  onUpdateFeedSettings: (
    key: string,
    settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
  ) => Promise<boolean>;
}

interface SharedFeedRowProps {
  selectedCategory: string;
  editingFeedKey: string | null;
  editingFeedName: string;
  editingFeedUrl: string;
  savingFeedKey: string | null;
  deletingKey: string | null;
  movingFeedKey: UseSettingsDragReturn["movingFeedKey"];
  draggingFeedKey: UseSettingsDragReturn["draggingFeedKey"];
  feedDropTarget: UseSettingsDragReturn["feedDropTarget"];
  onFeedDragStart: UseSettingsDragReturn["onFeedDragStart"];
  onFeedDragEnd: UseSettingsDragReturn["onFeedDragEnd"];
  onFeedDragOver: UseSettingsDragReturn["onFeedDragOver"];
  onFeedDrop: UseSettingsDragReturn["onFeedDrop"];
  onEditingFeedNameChange: (value: string) => void;
  onEditingFeedUrlChange: (value: string) => void;
  onSaveFeedRename: (key: string) => void;
  onCancelFeedEdit: () => void;
  onStartFeedEdit: (key: string, name: string, url: string) => void;
  onRemoveFeed: (key: string) => void;
  onToggleFeedEnabled: (key: string, enabled: boolean) => void;
  onToggleExtractionDisabled: (key: string, disabled: boolean) => void;
  onToggleProxyEnabled: (key: string, enabled: boolean) => void;
  togglingFeedKey: string | null;
  updatingSettingsKey: string | null;
}

export function useSettingsModalState({
  categories,
  categoryOptions,
  selectedCategory,
  onImportOpml,
  onDropFeed,
  onAddFeed,
  onAddCategory,
  onRenameCategory,
  onDropCategory,
  onRemoveFeed,
  onRenameFeed,
  onSetFeedEnabled,
  onUpdateFeedSettings,
}: UseSettingsModalStateOptions) {
  // ── Add-feed form state ───────────────────────────────────────────────────
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newFeedCategory, setNewFeedCategory] = useState(
    categoryOptions[0] ?? DEFAULT_CATEGORY_LABEL,
  );
  const [addingFeedInCategory, setAddingFeedInCategory] = useState<
    string | null
  >(null);
  const [isSavingFeed, setIsSavingFeed] = useState(false);

  // ── Category edit state ───────────────────────────────────────────────────
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [savingCategoryLabel, setSavingCategoryLabel] = useState<string | null>(
    null,
  );

  // ── Feed edit state ───────────────────────────────────────────────────────
  const [editingFeedKey, setEditingFeedKey] = useState<string | null>(null);
  const [editingFeedName, setEditingFeedName] = useState("");
  const [editingFeedUrl, setEditingFeedUrl] = useState("");
  const [savingFeedKey, setSavingFeedKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [togglingFeedKey, setTogglingFeedKey] = useState<string | null>(null);
  const [updatingSettingsKey, setUpdatingSettingsKey] = useState<string | null>(
    null,
  );

  // ── Drag state ────────────────────────────────────────────────────────────
  const drag = useSettingsDrag({ onDropFeed, onDropCategory });

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
    selectedCategory,
    editingFeedKey,
    editingFeedName,
    editingFeedUrl,
    savingFeedKey,
    deletingKey,
    movingFeedKey: drag.movingFeedKey,
    draggingFeedKey: drag.draggingFeedKey,
    feedDropTarget: drag.feedDropTarget,
    onFeedDragStart: drag.onFeedDragStart,
    onFeedDragEnd: drag.onFeedDragEnd,
    onFeedDragOver: drag.onFeedDragOver,
    onFeedDrop: drag.onFeedDrop,
    onEditingFeedNameChange: setEditingFeedName,
    onEditingFeedUrlChange: setEditingFeedUrl,
    onSaveFeedRename: (key: string) => void handleSaveFeedRename(key),
    onCancelFeedEdit: clearFeedEdit,
    onStartFeedEdit: (key: string, name: string, url: string) => {
      setEditingFeedKey(key);
      setEditingFeedName(name);
      setEditingFeedUrl(url);
    },
    onRemoveFeed: (key: string) => void handleRemoveFeed(key),
    onToggleFeedEnabled: (key: string, enabled: boolean) =>
      void handleToggleFeedEnabled(key, enabled),
    onToggleExtractionDisabled: (key: string, disabled: boolean) =>
      void handleToggleExtractionDisabled(key, disabled),
    onToggleProxyEnabled: (key: string, enabled: boolean) =>
      void handleToggleProxyEnabled(key, enabled),
    togglingFeedKey,
    updatingSettingsKey,
  };

  return {
    // State
    newFeedName,
    setNewFeedName,
    newFeedUrl,
    setNewFeedUrl,
    newCategoryName,
    setNewCategoryName,
    addingFeedInCategory,
    setAddingFeedInCategory,
    isSavingFeed,
    editingCategory,
    editingCategoryName,
    setEditingCategoryName,
    savingCategoryLabel,
    isImportingOpml,
    opmlInputRef,
    drag,
    sharedFeedRowProps,
    // Handlers
    handleAddFeed,
    handleAddCategory,
    handleSaveCategoryRename,
    handleOpmlFileChange,
    // Callbacks
    onStartCategoryEdit: (label: string) => {
      setEditingCategory(label);
      setEditingCategoryName(label);
    },
    onCancelCategoryEdit: clearCategoryEdit,
    onToggleAddFeed: (label: string) => {
      setAddingFeedInCategory(addingFeedInCategory === label ? null : label);
      setNewFeedName("");
      setNewFeedUrl("");
    },
    onCancelAddFeed: () => setAddingFeedInCategory(null),
  };
}
