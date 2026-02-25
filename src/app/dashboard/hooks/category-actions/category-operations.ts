import {
  FeedService,
  findCategoryByLabel,
  includesCategoryLabel,
  isSameCategoryLabel,
  normalizeCategory,
  removeCategoryLabel,
  replaceCategoryLabel,
  type CategoryTreeNode,
} from "@/lib";
import { toast } from "sonner";
import {
  flattenCategoryFeeds,
  toCategoryKey,
} from "../../services/category-tree";

export function addCategoryLabel({
  label,
  categories,
  customCategoryLabels,
  setCustomCategoryLabels,
}: {
  label: string;
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}): boolean {
  const normalized = normalizeCategory(label);
  if (!normalized) {
    toast.error("Category name is required.");
    return false;
  }

  const existing = new Set([
    ...categories.map((node) => node.label),
    ...customCategoryLabels,
  ]);

  if (includesCategoryLabel(Array.from(existing), normalized)) {
    toast.error("Category already exists.");
    return false;
  }

  setCustomCategoryLabels((current) => [...current, normalized]);
  toast.success("Category added.");
  return true;
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
        name: node.label,
        url: node.data?.url ?? "",
        category: targetCategory,
      }),
    ),
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
      key: toCategoryKey(targetCategory),
      label: targetCategory,
      children: [],
    });
    targetIndex = nextCategories.length - 1;
  }

  const destination = nextCategories[targetIndex];
  destination.children = destination.children ?? [];
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

export async function renameCategoryAndRefresh({
  categories,
  customCategoryLabels,
  selectedCategory,
  currentLabel,
  nextLabel,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setSelectedCategory,
  loadFeedSources,
}: {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  selectedCategory: string;
  currentLabel: string;
  nextLabel: string;
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
}): Promise<boolean> {
  const normalizedCurrent = normalizeCategory(currentLabel);
  const normalizedNext = normalizeCategory(nextLabel);

  if (!normalizedCurrent || !normalizedNext) {
    toast.error("Category name is required.");
    return false;
  }

  if (isSameCategoryLabel(normalizedCurrent, normalizedNext)) return false;

  const allLabels = new Set([
    ...categories.map((node) => node.label),
    ...customCategoryLabels,
  ]);

  if (includesCategoryLabel(Array.from(allLabels), normalizedNext)) {
    toast.error("Category already exists.");
    return false;
  }

  const categoryNode = findCategoryByLabel(categories, normalizedCurrent);
  const feedsInCategory = categoryNode?.children ?? [];
  const previousSelectedSourceUrl = flattenCategoryFeeds(categories).find(
    (node) => node.key === selectedCategory,
  )?.data?.url;

  try {
    let refreshedCategories: CategoryTreeNode[] | null = null;

    if (feedsInCategory.length > 0) {
      await assignFeedsToCategory(feedsInCategory, normalizedNext);
      refreshedCategories = await loadFeedSources();
    }

    setCustomCategoryLabels((current) =>
      replaceCategoryLabel(current, normalizedCurrent, normalizedNext),
    );
    setOrderedCategoryLabels((current) =>
      replaceCategoryLabel(current, normalizedCurrent, normalizedNext),
    );

    if (previousSelectedSourceUrl) {
      if (!refreshedCategories) refreshedCategories = await loadFeedSources();
      const selectedNode = flattenCategoryFeeds(refreshedCategories).find(
        (node) => node.data?.url === previousSelectedSourceUrl,
      );
      if (selectedNode) setSelectedCategory(selectedNode.key);
    }

    toast.success("Category updated.");
    return true;
  } catch (err) {
    console.error("Rename category error:", err);
    toast.error("Unable to rename category.");
    return false;
  }
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
  const safeTargetIndex = Math.max(0, Math.min(targetIndex, next.length));
  const insertionIndex =
    currentIndex < safeTargetIndex ? safeTargetIndex - 1 : safeTargetIndex;
  next.splice(insertionIndex, 0, moved);
  return next;
}

export async function removeCategoryAndRefresh({
  categories,
  customCategoryLabels,
  pendingCategoryRemovalLabel,
  selectedCategory,
  label,
  setPendingCategoryRemovalLabel,
  setCategories,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setSelectedCategory,
  ensureCategoryLabelExists,
  loadFeedSources,
}: {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  pendingCategoryRemovalLabel: string | null;
  selectedCategory: string;
  label: string;
  setPendingCategoryRemovalLabel: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  ensureCategoryLabelExists: (label: string) => void;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
}): Promise<boolean> {
  const categoryNode = findCategoryByLabel(categories, label);
  const feedsInCategory = categoryNode?.children ?? [];

  const removeBothLabels = (lbl: string) => {
    setCustomCategoryLabels((current) => removeCategoryLabel(current, lbl));
    setOrderedCategoryLabels((current) => removeCategoryLabel(current, lbl));
  };

  if (feedsInCategory.length > 0) {
    if (!isSameCategoryLabel(pendingCategoryRemovalLabel ?? "", label)) {
      setPendingCategoryRemovalLabel(label);
      return false;
    }

    const targetCategory = [
      ...categories.map((n) => n.label),
      ...customCategoryLabels,
    ]
      .map((l) => normalizeCategory(l))
      .find((candidate) => !isSameCategoryLabel(candidate, label));

    if (!targetCategory) {
      setPendingCategoryRemovalLabel(null);
      toast.error("Add another category before removing this one.");
      return false;
    }

    ensureCategoryLabelExists(targetCategory);

    setCategories((current) =>
      removeCategoryFromLocalState(current, label, targetCategory),
    );
    removeBothLabels(label);

    try {
      await assignFeedsToCategory(feedsInCategory, targetCategory);
      const refreshedCategories = await loadFeedSources();
      const previousSelectedSourceUrl = flattenCategoryFeeds(categories).find(
        (node) => node.key === selectedCategory,
      )?.data?.url;

      if (previousSelectedSourceUrl) {
        const selectedNode = flattenCategoryFeeds(refreshedCategories).find(
          (node) => node.data?.url === previousSelectedSourceUrl,
        );
        if (selectedNode) setSelectedCategory(selectedNode.key);
      }

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

  setPendingCategoryRemovalLabel(null);
  setCategories((current) => removeCategoryFromLocalState(current, label));
  removeBothLabels(label);
  toast.success("Category removed.");
  return true;
}
