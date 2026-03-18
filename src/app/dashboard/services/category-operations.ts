import { toast } from "sonner";

import {
  type CategoryTreeNode,
  FeedService,
  findCategoryByLabel,
  includesCategoryLabel,
  isSameCategoryLabel,
  normalizeCategory,
  removeCategoryLabel,
  replaceCategoryLabel,
} from "@/lib";

import {
  collectKnownCategoryLabels,
  findFeedNodeByUrl,
  getFeedUrlBySelectedKey,
  toCategoryKey,
} from "./category-tree";

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
  toast.success("Category added.");
  return true;
}

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
}: {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  ensureCategoryLabelExists: (label: string) => void;
  label: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  pendingCategoryRemovalLabel: null | string;
  selectedCategory: string;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setPendingCategoryRemovalLabel: React.Dispatch<
    React.SetStateAction<null | string>
  >;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}): Promise<boolean> {
  const categoryNode = findCategoryByLabel(categories, label);
  const feedsInCategory = categoryNode?.children ?? [];
  const hasFeeds = feedsInCategory.length > 0;

  if (!hasFeeds) {
    setPendingCategoryRemovalLabel(null);
    setCategories((current) => removeCategoryFromLocalState(current, label));
    removeCategoryFromLabelCollections(
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      label,
    );
    toast.success("Category removed.");
    return true;
  }

  if (!isSameCategoryLabel(pendingCategoryRemovalLabel ?? "", label)) {
    setPendingCategoryRemovalLabel(label);
    return false;
  }

  const targetCategory = getCategoryRemovalTarget(
    categories,
    customCategoryLabels,
    label,
  );

  if (!targetCategory) {
    setPendingCategoryRemovalLabel(null);
    toast.error("Add another category before removing this one.");
    return false;
  }

  ensureCategoryLabelExists(targetCategory);

  setCategories((current) =>
    removeCategoryFromLocalState(current, label, targetCategory),
  );
  removeCategoryFromLabelCollections(
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    label,
  );

  try {
    await assignFeedsToCategory(feedsInCategory, targetCategory);
    const refreshedCategories = await loadFeedSources();
    const previousSelectedSourceUrl = getFeedUrlBySelectedKey(
      categories,
      selectedCategory,
    );

    restoreSelectedCategoryFromSourceUrl({
      refreshedCategories,
      selectedSourceUrl: previousSelectedSourceUrl,
      setSelectedCategory,
    });

    setPendingCategoryRemovalLabel(null);
    toast.success(`Category removed. Feeds moved to "${targetCategory}".`);
    return true;
  } catch (err) {
    console.error("Remove category error:", err);
    setPendingCategoryRemovalLabel(null);
    toast.error("Unable to remove category right now.");
    return false;
  }
}

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
}: {
  categories: CategoryTreeNode[];
  currentLabel: string;
  customCategoryLabels: string[];
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  nextLabel: string;
  selectedCategory: string;
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}): Promise<boolean> {
  const normalizedCurrent = normalizeCategory(currentLabel);
  const normalizedNext = normalizeCategory(nextLabel);

  if (!normalizedCurrent || !normalizedNext) {
    toast.error("Category name is required.");
    return false;
  }

  if (isSameCategoryLabel(normalizedCurrent, normalizedNext)) {
    return false;
  }

  const allLabels = collectKnownCategoryLabels(
    categories,
    customCategoryLabels,
  );

  if (includesCategoryLabel(allLabels, normalizedNext)) {
    toast.error("Category already exists.");
    return false;
  }

  const categoryNode = findCategoryByLabel(categories, normalizedCurrent);
  const feedsInCategory = categoryNode?.children ?? [];
  const previousSelectedSourceUrl = getFeedUrlBySelectedKey(
    categories,
    selectedCategory,
  );

  try {
    let refreshedCategories: CategoryTreeNode[] = categories;
    let categoriesWereReloaded = false;

    if (feedsInCategory.length > 0) {
      await assignFeedsToCategory(feedsInCategory, normalizedNext);
      refreshedCategories = await loadFeedSources();
      categoriesWereReloaded = true;
    }

    updateCategoryLabelCollections(
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      (current) =>
        replaceCategoryLabel(current, normalizedCurrent, normalizedNext),
    );

    if (previousSelectedSourceUrl) {
      if (!categoriesWereReloaded) {
        refreshedCategories = await loadFeedSources();
      }
      restoreSelectedCategoryFromSourceUrl({
        refreshedCategories,
        selectedSourceUrl: previousSelectedSourceUrl,
        setSelectedCategory,
      });
    }

    toast.success("Category updated.");
    return true;
  } catch (err) {
    console.error("Rename category error:", err);
    toast.error("Unable to rename category.");
    return false;
  }
}

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

function getCategoryRemovalTarget(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
  labelToRemove: string,
): string | undefined {
  return collectKnownCategoryLabels(categories, customCategoryLabels)
    .map((label) => normalizeCategory(label))
    .find((label) => !isSameCategoryLabel(label, labelToRemove));
}

function removeCategoryFromLabelCollections(
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>,
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>,
  label: string,
): void {
  updateCategoryLabelCollections(
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    (current) => removeCategoryLabel(current, label),
  );
}

function removeCategoryFromLocalState(
  currentCategories: CategoryTreeNode[],
  labelToRemove: string,
  targetCategory?: string,
): CategoryTreeNode[] {
  const sourceIndex = currentCategories.findIndex((category) =>
    isSameCategoryLabel(category.label, labelToRemove),
  );
  if (sourceIndex < 0) return currentCategories;

  const sourceCategory = currentCategories[sourceIndex];
  const sourceFeeds = sourceCategory.children ?? [];
  const nextCategories = currentCategories
    .filter((category) => !isSameCategoryLabel(category.label, labelToRemove))
    .map((category) => ({
      ...category,
      children: [...(category.children ?? [])],
    }));

  if (!targetCategory || sourceFeeds.length === 0) {
    return nextCategories;
  }

  let targetIndex = nextCategories.findIndex((category) =>
    isSameCategoryLabel(category.label, targetCategory),
  );

  if (targetIndex < 0) {
    nextCategories.push({
      children: [],
      key: toCategoryKey(targetCategory),
      label: targetCategory,
    });
    targetIndex = nextCategories.length - 1;
  }

  const destination = nextCategories[targetIndex];
  destination.children.push(
    ...sourceFeeds.map((feed) => ({
      ...feed,
      data: {
        ...(feed.data ?? { url: "" }),
        category: destination.label,
      },
    })),
  );

  return nextCategories;
}

function restoreSelectedCategoryFromSourceUrl({
  refreshedCategories,
  selectedSourceUrl,
  setSelectedCategory,
}: {
  refreshedCategories: CategoryTreeNode[];
  selectedSourceUrl?: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}): void {
  if (!selectedSourceUrl) {
    return;
  }

  const selectedNode = findFeedNodeByUrl(
    refreshedCategories,
    selectedSourceUrl,
  );

  if (selectedNode) {
    setSelectedCategory(selectedNode.key);
  }
}

function updateCategoryLabelCollections(
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>,
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>,
  update: (labels: string[]) => string[],
): void {
  setCustomCategoryLabels((current) => update(current));
  setOrderedCategoryLabels((current) => update(current));
}
