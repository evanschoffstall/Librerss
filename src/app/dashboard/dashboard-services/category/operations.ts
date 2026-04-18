import { toast } from "sonner";

import type { CategoryTreeNode } from "@/lib/core";

import {
  getCategoryRemovalTarget,
  removeCategoryFromLabelCollections,
  removeCategoryFromLocalState,
  restoreSelectedCategoryFromSourceUrl,
  updateCategoryLabelCollections,
} from "@/app/dashboard/dashboard-services/category";
import {
  collectKnownCategoryLabels,
  getFeedUrlBySelectedKey,
} from "@/app/dashboard/dashboard-services/category-tree";
import { FeedService } from "@/lib/api";
import {
  findCategoryByLabel,
  includesCategoryLabel,
  isSameCategoryLabel,
  normalizeCategory,
  replaceCategoryLabel,
} from "@/lib/utils";

interface CategoryLabelCollectionSetters {
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}

interface CategoryRemovalStateSetters extends CategoryLabelCollectionSetters {
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setPendingCategoryRemovalLabel: React.Dispatch<
    React.SetStateAction<null | string>
  >;
}

interface RemoveCategoryAndRefreshOptions extends CategoryRemovalStateSetters {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  ensureCategoryLabelExists: (label: string) => void;
  label: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  pendingCategoryRemovalLabel: null | string;
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

interface RenameCategoryAndRefreshOptions {
  categories: CategoryTreeNode[];
  currentLabel: string;
  customCategoryLabels: string[];
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  nextLabel: string;
  selectedCategory: string;
  setCustomCategoryLabels: CategoryLabelCollectionSetters["setCustomCategoryLabels"];
  setOrderedCategoryLabels: CategoryLabelCollectionSetters["setOrderedCategoryLabels"];
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.customCategoryLabels
 * @param root0.label
 * @param root0.setCustomCategoryLabels
 */
export function addCategoryLabel({
  categories,
  customCategoryLabels,
  label,
  setCustomCategoryLabels,
}: {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  label: string;
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}): boolean {
  const normalized = normalizeCategory(label);
  if (!normalized) {
    toast.error("Category name is required.");
    return false;
  }

  const existing = collectKnownCategoryLabels(categories, customCategoryLabels);

  if (includesCategoryLabel(existing, normalized)) {
    toast.error("Category already exists.");
    return false;
  }

  setCustomCategoryLabels((current) => [...current, normalized]);
  return true;
}

/**
 * @param current
 * @param label
 * @param targetIndex
 */
export function moveCategoryByDropInOrder(
  current: string[],
  label: string,
  targetIndex: number,
) {
  const currentIndex = current.findIndex((currentLabel) =>
    isSameCategoryLabel(currentLabel, label),
  );
  if (currentIndex < 0) return current;

  const next = [...current];
  const [moved] = next.splice(currentIndex, 1);
  const adjusted = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertionIndex = Math.max(0, Math.min(adjusted, next.length));
  next.splice(insertionIndex, 0, moved);
  return next;
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.customCategoryLabels
 * @param root0.ensureCategoryLabelExists
 * @param root0.label
 * @param root0.loadFeedSources
 * @param root0.pendingCategoryRemovalLabel
 * @param root0.selectedCategory
 * @param root0.setCategories
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 * @param root0.setPendingCategoryRemovalLabel
 * @param root0.setSelectedCategory
 */
export async function removeCategoryAndRefresh({
  categories,
  customCategoryLabels,
  ensureCategoryLabelExists,
  label,
  loadFeedSources,
  pendingCategoryRemovalLabel,
  selectedCategory,
  setCategories,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setPendingCategoryRemovalLabel,
  setSelectedCategory,
}: RemoveCategoryAndRefreshOptions): Promise<boolean> {
  const removalState = resolveCategoryRemovalState({
    categories,
    customCategoryLabels,
    label,
    pendingCategoryRemovalLabel,
    setCategories,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    setPendingCategoryRemovalLabel,
  });
  if (!removalState) {
    return false;
  }
  if (removalState.completed) {
    return true;
  }

  try {
    await commitCategoryRemoval({
      categories,
      ensureCategoryLabelExists,
      feedsInCategory: removalState.feedsInCategory,
      label,
      loadFeedSources,
      selectedCategory,
      setCategories,
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      setPendingCategoryRemovalLabel,
      setSelectedCategory,
      targetCategory: removalState.targetCategory,
    });
    return true;
  } catch (err) {
    console.error("Remove category error:", err);
    setPendingCategoryRemovalLabel(null);
    toast.error("Unable to remove category right now.");
    return false;
  }
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.currentLabel
 * @param root0.customCategoryLabels
 * @param root0.loadFeedSources
 * @param root0.nextLabel
 * @param root0.selectedCategory
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 * @param root0.setSelectedCategory
 */
export async function renameCategoryAndRefresh({
  categories,
  currentLabel,
  customCategoryLabels,
  loadFeedSources,
  nextLabel,
  selectedCategory,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setSelectedCategory,
}: RenameCategoryAndRefreshOptions): Promise<boolean> {
  const renameInput = validateCategoryRename({
    categories,
    currentLabel,
    customCategoryLabels,
    nextLabel,
  });
  if (!renameInput) {
    return false;
  }

  const renameContext = getCategoryRenameContext({
    categories,
    normalizedCurrent: renameInput.normalizedCurrent,
    selectedCategory,
  });
  try {
    await commitCategoryRename({
      categories,
      loadFeedSources,
      normalizedCurrent: renameInput.normalizedCurrent,
      normalizedNext: renameInput.normalizedNext,
      renameContext,
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      setSelectedCategory,
    });
    toast.success("Category updated.");
    return true;
  } catch (err) {
    console.error("Rename category error:", err);
    toast.error("Unable to rename category.");
    return false;
  }
}

/**
 * @param root0
 * @param root0.label
 * @param root0.setCategories
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 * @param root0.setPendingCategoryRemovalLabel
 */
function applyImmediateCategoryRemoval({
  label,
  setCategories,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setPendingCategoryRemovalLabel,
}: CategoryRemovalStateSetters & { label: string }) {
  setPendingCategoryRemovalLabel(null);
  setCategories((current) => removeCategoryFromLocalState(current, label));
  removeCategoryFromLabelCollections(
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    label,
  );
}

/**
 * @param feedNodes
 * @param targetCategory
 */
async function assignFeedsToCategory(
  feedNodes: CategoryTreeNode[],
  targetCategory: string,
) {
  const transferableFeeds = feedNodes.filter((node) => Boolean(node.data?.url));
  if (transferableFeeds.length === 0) return;

  await Promise.all(
    transferableFeeds.map((node) =>
      FeedService.createFeedSource({
        category: targetCategory,
        name: node.label,
        url: node.data?.url ?? "",
      }),
    ),
  );
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.ensureCategoryLabelExists
 * @param root0.feedsInCategory
 * @param root0.label
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setCategories
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 * @param root0.setPendingCategoryRemovalLabel
 * @param root0.setSelectedCategory
 * @param root0.targetCategory
 */
async function commitCategoryRemoval({
  categories,
  ensureCategoryLabelExists,
  feedsInCategory,
  label,
  loadFeedSources,
  selectedCategory,
  setCategories,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setPendingCategoryRemovalLabel,
  setSelectedCategory,
  targetCategory,
}: CategoryRemovalStateSetters & {
  categories: CategoryTreeNode[];
  ensureCategoryLabelExists: (label: string) => void;
  feedsInCategory: CategoryTreeNode[];
  label: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  targetCategory: string;
}) {
  ensureCategoryLabelExists(targetCategory);
  setCategories((current) =>
    removeCategoryFromLocalState(current, label, targetCategory),
  );
  removeCategoryFromLabelCollections(
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    label,
  );
  await assignFeedsToCategory(feedsInCategory, targetCategory);
  const refreshedCategories = await loadFeedSources();
  restoreCategorySelectionAfterRefresh({
    categories,
    refreshedCategories,
    selectedCategory,
    setSelectedCategory,
  });
  setPendingCategoryRemovalLabel(null);
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.loadFeedSources
 * @param root0.normalizedCurrent
 * @param root0.normalizedNext
 * @param root0.renameContext
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 * @param root0.setSelectedCategory
 */
async function commitCategoryRename({
  categories,
  loadFeedSources,
  normalizedCurrent,
  normalizedNext,
  renameContext,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setSelectedCategory,
}: {
  categories: CategoryTreeNode[];
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  normalizedCurrent: string;
  normalizedNext: string;
  renameContext: ReturnType<typeof getCategoryRenameContext>;
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}) {
  let refreshedCategories: CategoryTreeNode[] = categories;
  let categoriesWereReloaded = false;

  if (renameContext.feedsInCategory.length > 0) {
    await assignFeedsToCategory(renameContext.feedsInCategory, normalizedNext);
    refreshedCategories = await loadFeedSources();
    categoriesWereReloaded = true;
  }

  updateCategoryLabelCollections(
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    (current) =>
      replaceCategoryLabel(current, normalizedCurrent, normalizedNext),
  );

  if (renameContext.previousSelectedSourceUrl) {
    refreshedCategories = await ensureCategoriesLoadedForSelectionRestore({
      categoriesWereReloaded,
      loadFeedSources,
      refreshedCategories,
    });
    restoreSelectedCategoryFromSourceUrl({
      refreshedCategories,
      selectedSourceUrl: renameContext.previousSelectedSourceUrl,
      setSelectedCategory,
    });
  }
}

/**
 * @param root0
 * @param root0.categoriesWereReloaded
 * @param root0.loadFeedSources
 * @param root0.refreshedCategories
 */
async function ensureCategoriesLoadedForSelectionRestore({
  categoriesWereReloaded,
  loadFeedSources,
  refreshedCategories,
}: {
  categoriesWereReloaded: boolean;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  refreshedCategories: CategoryTreeNode[];
}) {
  if (categoriesWereReloaded) {
    return refreshedCategories;
  }

  return loadFeedSources();
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.normalizedCurrent
 * @param root0.selectedCategory
 */
function getCategoryRenameContext({
  categories,
  normalizedCurrent,
  selectedCategory,
}: {
  categories: CategoryTreeNode[];
  normalizedCurrent: string;
  selectedCategory: string;
}) {
  const categoryNode = findCategoryByLabel(categories, normalizedCurrent);

  return {
    feedsInCategory: categoryNode?.children ?? [],
    previousSelectedSourceUrl: getFeedUrlBySelectedKey(
      categories,
      selectedCategory,
    ),
  };
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.customCategoryLabels
 * @param root0.label
 * @param root0.pendingCategoryRemovalLabel
 * @param root0.setCategories
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 * @param root0.setPendingCategoryRemovalLabel
 */
function resolveCategoryRemovalState({
  categories,
  customCategoryLabels,
  label,
  pendingCategoryRemovalLabel,
  setCategories,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setPendingCategoryRemovalLabel,
}: CategoryRemovalStateSetters & {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  label: string;
  pendingCategoryRemovalLabel: null | string;
}):
  | null
  | {
      completed: false;
      feedsInCategory: CategoryTreeNode[];
      targetCategory: string;
    }
  | { completed: true } {
  const feedsInCategory =
    findCategoryByLabel(categories, label)?.children ?? [];
  if (feedsInCategory.length === 0) {
    applyImmediateCategoryRemoval({
      label,
      setCategories,
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      setPendingCategoryRemovalLabel,
    });
    return { completed: true };
  }

  if (!isSameCategoryLabel(pendingCategoryRemovalLabel ?? "", label)) {
    setPendingCategoryRemovalLabel(label);
    return null;
  }

  const targetCategory = getCategoryRemovalTarget(
    categories,
    customCategoryLabels,
    label,
  );
  if (!targetCategory) {
    setPendingCategoryRemovalLabel(null);
    toast.error("Add another category before removing this one.");
    return null;
  }

  return { completed: false, feedsInCategory, targetCategory };
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.refreshedCategories
 * @param root0.selectedCategory
 * @param root0.setSelectedCategory
 */
function restoreCategorySelectionAfterRefresh({
  categories,
  refreshedCategories,
  selectedCategory,
  setSelectedCategory,
}: {
  categories: CategoryTreeNode[];
  refreshedCategories: CategoryTreeNode[];
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}) {
  const previousSelectedSourceUrl = getFeedUrlBySelectedKey(
    categories,
    selectedCategory,
  );

  restoreSelectedCategoryFromSourceUrl({
    refreshedCategories,
    selectedSourceUrl: previousSelectedSourceUrl,
    setSelectedCategory,
  });
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.currentLabel
 * @param root0.customCategoryLabels
 * @param root0.nextLabel
 */
function validateCategoryRename({
  categories,
  currentLabel,
  customCategoryLabels,
  nextLabel,
}: {
  categories: CategoryTreeNode[];
  currentLabel: string;
  customCategoryLabels: string[];
  nextLabel: string;
}) {
  const normalizedCurrent = normalizeCategory(currentLabel);
  const normalizedNext = normalizeCategory(nextLabel);
  if (!normalizedCurrent || !normalizedNext) {
    toast.error("Category name is required.");
    return null;
  }

  if (isSameCategoryLabel(normalizedCurrent, normalizedNext)) {
    return null;
  }

  const allLabels = collectKnownCategoryLabels(
    categories,
    customCategoryLabels,
  );
  if (includesCategoryLabel(allLabels, normalizedNext)) {
    toast.error("Category already exists.");
    return null;
  }

  return { normalizedCurrent, normalizedNext };
}
