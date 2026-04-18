"use client";

import { useEffect, useState } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import { isSameCategoryLabel } from "@/lib/utils";

interface UseSettingsCategoryStateOptions {
  categories: CategoryTreeNode[];
  onAddCategory: (name: string) => boolean;
  onRenameCategory: (fromLabel: string, toLabel: string) => Promise<boolean>;
}

/**
 * Manage the settings category state.
 * @param options - The options used to manage the settings category state.
 * @returns The settings category state state and callbacks.
 */
export function useSettingsCategoryState(
  options: UseSettingsCategoryStateOptions,
) {
  const { categories, onAddCategory, onRenameCategory } = options;
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

  /**
   * Process the clear category edit.
   */
  const clearCategoryEdit = () => {
    setEditingCategory(null);
    setEditingCategoryName("");
  };

  /**
   * Process the handle add category.
   */
  const handleAddCategory = () => {
    const didAdd = onAddCategory(newCategoryName.trim());
    if (!didAdd) {
      return;
    }

    setNewCategoryName("");
  };

  /**
   * Process the handle save category rename.
   * @param currentLabel - The current label.
   */
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
    /**
     * Starts editing a category using its current label as the draft value.
     * @param label - Category label to open in edit mode.
     */
    onStartCategoryEdit: (label: string) => {
      setEditingCategory(label);
      setEditingCategoryName(label);
    },
    savingCategoryLabel,
    setEditingCategoryName,
    setNewCategoryName,
  };
}
