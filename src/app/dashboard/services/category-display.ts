import { normalizeCategoryLabelKey, type CategoryTreeNode } from "@/lib";
import { toCategoryKey } from "./category-tree";

export function buildDisplayCategories(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
  orderedCategoryLabels: string[],
): CategoryTreeNode[] {
  const categoryMap = new Map<string, CategoryTreeNode>(
    categories.map((node) => [normalizeCategoryLabelKey(node.label), node]),
  );

  for (const label of customCategoryLabels) {
    const key = normalizeCategoryLabelKey(label);
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { key: toCategoryKey(label), label, children: [] });
    }
  }

  const orderedLabels =
    orderedCategoryLabels.length > 0
      ? orderedCategoryLabels
      : [...categoryMap.values()].map((node) => node.label);

  return orderedLabels
    .map((label) => categoryMap.get(normalizeCategoryLabelKey(label)))
    .filter((node): node is CategoryTreeNode => node !== undefined);
}

export function computeNextOrderedCategoryLabels(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
  currentLabels: string[],
): string[] {
  const seen = new Set<string>();
  const uniqueLabels: string[] = [];

  for (const label of [
    ...categories.map((node) => node.label),
    ...customCategoryLabels.filter(
      (label) =>
        !categories.some(
          (node) =>
            normalizeCategoryLabelKey(node.label) ===
            normalizeCategoryLabelKey(label),
        ),
    ),
  ]) {
    const key = normalizeCategoryLabelKey(label);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLabels.push(label);
    }
  }

  const existingKeys = new Set(uniqueLabels.map(normalizeCategoryLabelKey));
  const preserved = currentLabels.filter((label) =>
    existingKeys.has(normalizeCategoryLabelKey(label)),
  );
  const preservedKeys = new Set(preserved.map(normalizeCategoryLabelKey));
  const appended = uniqueLabels.filter(
    (label) => !preservedKeys.has(normalizeCategoryLabelKey(label)),
  );

  return [...preserved, ...appended];
}
