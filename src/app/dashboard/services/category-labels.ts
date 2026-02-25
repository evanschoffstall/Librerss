import {
  includesCategoryLabel,
  normalizeCategoryLabelKey,
  type CategoryTreeNode,
} from "@/lib";

export function collectKnownCategoryLabels(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
): string[] {
  return [...categories.map((node) => node.label), ...customCategoryLabels];
}

export function toDistinctCategoryLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const uniqueLabels: string[] = [];

  for (const label of labels) {
    const key = normalizeCategoryLabelKey(label);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueLabels.push(label);
  }

  return uniqueLabels;
}

export function hasCategoryLabelInTree(
  categories: CategoryTreeNode[],
  label: string,
): boolean {
  return includesCategoryLabel(
    categories.map((category) => category.label),
    label,
  );
}
