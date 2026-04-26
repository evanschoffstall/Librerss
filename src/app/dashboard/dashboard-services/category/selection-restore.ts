import type { CategoryTreeNode } from "@/lib/core";

import { restoreSelectedCategoryFromSourceUrl } from "@/app/dashboard/dashboard-services/category";
import { getFeedUrlBySelectedKey } from "@/app/dashboard/dashboard-services/category-tree";

/**
 * Describes the options for ensure categories loaded for selection restore.
 */
interface EnsureCategoriesLoadedForSelectionRestoreOptions {
  categoriesWereReloaded: boolean;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  refreshedCategories: CategoryTreeNode[];
}

/**
 * Describes the options for restore category selection after refresh.
 */
interface RestoreCategorySelectionAfterRefreshOptions {
  categories: CategoryTreeNode[];
  refreshedCategories: CategoryTreeNode[];
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * Ensure refreshed categories are available before restoring category selection.
 * @param options - The reload state and category loader used during selection restore.
 * @returns The categories that should be used for selection restoration.
 */
export async function ensureCategoriesLoadedForSelectionRestore(
  options: EnsureCategoriesLoadedForSelectionRestoreOptions,
) {
  const { categoriesWereReloaded, loadFeedSources, refreshedCategories } =
    options;

  if (categoriesWereReloaded) {
    return refreshedCategories;
  }

  return loadFeedSources();
}

/**
 * Restore the selected category after feed sources have been refreshed.
 * @param options - The categories and selection setter used during restoration.
 */
export function restoreCategorySelectionAfterRefresh(
  options: RestoreCategorySelectionAfterRefreshOptions,
) {
  const {
    categories,
    refreshedCategories,
    selectedCategory,
    setSelectedCategory,
  } = options;
  const previousSelectedSourceUrl = getFeedUrlBySelectedKey(
    categories,
    selectedCategory,
  );

  if (!previousSelectedSourceUrl) {
    return;
  }

  restoreSelectedCategoryFromSourceUrl({
    refreshedCategories,
    selectedSourceUrl: previousSelectedSourceUrl,
    setSelectedCategory,
  });
}
