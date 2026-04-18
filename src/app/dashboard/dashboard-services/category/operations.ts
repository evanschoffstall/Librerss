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

interface AddCategoryLabelOptions {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  label: string;
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}

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

interface CategoryRenameContextOptions {
  categories: CategoryTreeNode[];
  normalizedCurrent: string;
  selectedCategory: string;
}
interface CommitCategoryRenameOptions {
  categories: CategoryTreeNode[];
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  normalizedCurrent: string;
  normalizedNext: string;
  renameContext: ReturnType<typeof getCategoryRenameContext>;
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

interface EnsureCategoriesLoadedForSelectionRestoreOptions {
  categoriesWereReloaded: boolean;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  refreshedCategories: CategoryTreeNode[];
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

interface RestoreCategorySelectionAfterRefreshOptions {
  categories: CategoryTreeNode[];
  refreshedCategories: CategoryTreeNode[];
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

interface ValidateCategoryRenameOptions {
  categories: CategoryTreeNode[];
  currentLabel: string;
  customCategoryLabels: string[];
  nextLabel: string;
}

/**
 * Process the add category label.
 * @param options - The options used to process the add category label.
 * @returns Whether add category label.
 */
export function addCategoryLabel(options: AddCategoryLabelOptions): boolean {
  const { categories, customCategoryLabels, label, setCustomCategoryLabels } =
    options;
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
 * Process the move category by drop in order.
 * @param current - The current.
 * @param label - The label.
 * @param targetIndex - The target index value.
 * @returns The move category by drop in order.
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
 * Process the remove category and refresh.
 * @param options - The options used to process the remove category and refresh.
 * @returns The remove category and refresh.
 */
export async function removeCategoryAndRefresh(
  options: RemoveCategoryAndRefreshOptions,
): Promise<boolean> {
  const {
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
  } = options;
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
 * Process the rename category and refresh.
 * @param options - The options used to process the rename category and refresh.
 * @returns The rename category and refresh.
 */
export async function renameCategoryAndRefresh(
  options: RenameCategoryAndRefreshOptions,
): Promise<boolean> {
  const {
    categories,
    currentLabel,
    customCategoryLabels,
    loadFeedSources,
    nextLabel,
    selectedCategory,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    setSelectedCategory,
  } = options;
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
 * Process the apply immediate category removal.
 * @param options - The options used to process the apply immediate category removal.
 */
function applyImmediateCategoryRemoval(
  options: CategoryRemovalStateSetters & { label: string },
) {
  const {
    label,
    setCategories,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    setPendingCategoryRemovalLabel,
  } = options;
  setPendingCategoryRemovalLabel(null);
  setCategories((current) => removeCategoryFromLocalState(current, label));
  removeCategoryFromLabelCollections(
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    label,
  );
}

/**
 * Process the assign feeds to category.
 * @param feedNodes - The feed nodes.
 * @param targetCategory - The target category.
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
 * Process the commit category removal.
 * @param options - The options used to process the commit category removal.
 */
async function commitCategoryRemoval(
  options: CategoryRemovalStateSetters & {
    categories: CategoryTreeNode[];
    ensureCategoryLabelExists: (label: string) => void;
    feedsInCategory: CategoryTreeNode[];
    label: string;
    loadFeedSources: () => Promise<CategoryTreeNode[]>;
    selectedCategory: string;
    setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
    targetCategory: string;
  },
) {
  const {
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
  } = options;
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
 * Process the commit category rename.
 * @param options - The options used to process the commit category rename.
 */
async function commitCategoryRename(options: CommitCategoryRenameOptions) {
  const {
    categories,
    loadFeedSources,
    normalizedCurrent,
    normalizedNext,
    renameContext,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    setSelectedCategory,
  } = options;
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
 * Process the ensure categories loaded for selection restore.
 * @param options - The options used to process the ensure categories loaded for selection restore.
 * @returns The ensure categories loaded for selection restore.
 */
async function ensureCategoriesLoadedForSelectionRestore(
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
 * Return the category rename context.
 * @param options - The options used to return the category rename context.
 * @returns The category rename context.
 */
function getCategoryRenameContext(options: CategoryRenameContextOptions) {
  const { categories, normalizedCurrent, selectedCategory } = options;
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
 * Resolve the category removal state.
 * @param options - The options used to resolve the category removal state.
 * @returns The category removal state.
 */
function resolveCategoryRemovalState(
  options: CategoryRemovalStateSetters & {
    categories: CategoryTreeNode[];
    customCategoryLabels: string[];
    label: string;
    pendingCategoryRemovalLabel: null | string;
  },
):
  | null
  | {
      completed: false;
      feedsInCategory: CategoryTreeNode[];
      targetCategory: string;
    }
  | { completed: true } {
  const {
    categories,
    customCategoryLabels,
    label,
    pendingCategoryRemovalLabel,
    setCategories,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    setPendingCategoryRemovalLabel,
  } = options;
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
 * Process the restore category selection after refresh.
 * @param options - The options used to process the restore category selection after refresh.
 */
function restoreCategorySelectionAfterRefresh(
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

  restoreSelectedCategoryFromSourceUrl({
    refreshedCategories,
    selectedSourceUrl: previousSelectedSourceUrl,
    setSelectedCategory,
  });
}

/**
 * Process the validate category rename.
 * @param options - The options used to process the validate category rename.
 * @returns The validate category rename.
 */
function validateCategoryRename(options: ValidateCategoryRenameOptions) {
  const { categories, currentLabel, customCategoryLabels, nextLabel } = options;
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
