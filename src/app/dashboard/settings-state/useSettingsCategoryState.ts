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
  const onStartCategoryEdit = createStartCategoryEditHandler(
    setEditingCategory,
    setEditingCategoryName,
  );

  useClearMissingEditingCategory(
    categories,
    editingCategory,
    setEditingCategory,
    setEditingCategoryName,
  );

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
    onStartCategoryEdit,
    savingCategoryLabel,
    setEditingCategoryName,
    setNewCategoryName,
  };
}

/**
 * Create the category edit starter that syncs the draft name with the selected label.
 * @param setEditingCategory - Updates the active editing label.
 * @param setEditingCategoryName - Updates the editing input value.
 * @returns The handler that starts editing a category.
 */
function createStartCategoryEditHandler(
  setEditingCategory: React.Dispatch<React.SetStateAction<null | string>>,
  setEditingCategoryName: React.Dispatch<React.SetStateAction<string>>,
) {
  return (label: string) => {
    setEditingCategory(label);
    setEditingCategoryName(label);
  };
}

/**
 * Manage clearing the active edit when its category disappears from the tree.
 * @param categories - The available category nodes.
 * @param editingCategory - The label currently being edited.
 * @param setEditingCategory - Updates the active editing label.
 * @param setEditingCategoryName - Updates the editing input value.
 */
function useClearMissingEditingCategory(
  categories: CategoryTreeNode[],
  editingCategory: null | string,
  setEditingCategory: React.Dispatch<React.SetStateAction<null | string>>,
  setEditingCategoryName: React.Dispatch<React.SetStateAction<string>>,
) {
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
  }, [categories, editingCategory, setEditingCategory, setEditingCategoryName]);
}
