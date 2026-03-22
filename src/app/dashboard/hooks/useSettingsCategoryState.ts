"use client";

import { useEffect, useState } from "react";

import { type CategoryTreeNode, isSameCategoryLabel } from "@/lib";

interface UseSettingsCategoryStateOptions {
  categories: CategoryTreeNode[];
  onAddCategory: (name: string) => boolean;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
}

/**
 * Owns category creation and rename state for the settings surface.
 *
 * The modal's category controls only need local draft values plus persistence
 * handlers, so this hook isolates that workflow from feed editing concerns.
 */
export function useSettingsCategoryState({
  categories,
  onAddCategory,
  onRenameCategory,
}: UseSettingsCategoryStateOptions) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<null | string>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [savingCategoryLabel, setSavingCategoryLabel] = useState<null | string>(
    null,
  );

  useEffect(() => {
    if (
      editingCategory &&
      !categories.some((categoryNode) =>
        isSameCategoryLabel(categoryNode.label, editingCategory),
      )
    ) {
      setEditingCategory(null);
      setEditingCategoryName("");
    }
  }, [categories, editingCategory]);

  const clearCategoryEdit = () => {
    setEditingCategory(null);
    setEditingCategoryName("");
  };

  const handleAddCategory = () => {
    const didAdd = onAddCategory(newCategoryName.trim());
    if (!didAdd) {
      return;
    }

    setNewCategoryName("");
  };

  const handleSaveCategoryRename = async (currentLabel: string) => {
    setSavingCategoryLabel(currentLabel);
    try {
      const didSave = await onRenameCategory(
        currentLabel,
        editingCategoryName.trim(),
      );
      if (!didSave) {
        return;
      }

      clearCategoryEdit();
    } finally {
      setSavingCategoryLabel(null);
    }
  };

  return {
    editingCategory,
    editingCategoryName,
    handleAddCategory,
    handleSaveCategoryRename,
    newCategoryName,
    onCancelCategoryEdit: clearCategoryEdit,
    onStartCategoryEdit: (label: string) => {
      setEditingCategory(label);
      setEditingCategoryName(label);
    },
    savingCategoryLabel,
    setEditingCategoryName,
    setNewCategoryName,
  };
}