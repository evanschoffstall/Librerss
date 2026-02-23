"use client";

/**
 * Category CRUD: add, rename, remove, reorder.
 * Feed-source CRUD lives in useFeedSourceActions.
 */

import {
  FeedService,
  normalizeCategory,
  normalizeCategoryLabelKey,
  type Article,
  type CategoryTreeNode,
} from "@/lib";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { flattenCategoryFeeds } from "../helpers/category-helpers";
import { useFeedSourceActions } from "./useFeedSourceActions";

interface UseCategoryManagerOptions {
  categories: CategoryTreeNode[];
  selectedCategory: string;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (categoryNode: CategoryTreeNode) => Promise<void>;
}

export function useCategoryManager({
  categories,
  selectedCategory,
  setCategories,
  setSelectedCategory,
  setFeed,
  loadFeedSources,
  fetchFeed,
  fetchCategoryFeeds,
}: UseCategoryManagerOptions) {
  const [customCategoryLabels, setCustomCategoryLabels] = useState<string[]>(
    [],
  );
  const [orderedCategoryLabels, setOrderedCategoryLabels] = useState<string[]>(
    [],
  );
  const [pendingCategoryRemovalLabel, setPendingCategoryRemovalLabel] =
    useState<string | null>(null);

  const ensureCategoryLabelExists = useCallback(
    (label: string) => {
      const normalized = normalizeCategoryLabelKey(label);

      setCustomCategoryLabels((current) => {
        if (current.some((l) => normalizeCategoryLabelKey(l) === normalized))
          return current;
        if (
          categories.some(
            (node) => normalizeCategoryLabelKey(node.label) === normalized,
          )
        )
          return current;
        return [...current, label];
      });

      setOrderedCategoryLabels((current) => {
        if (current.some((l) => normalizeCategoryLabelKey(l) === normalized))
          return current;
        return [...current, label];
      });
    },
    [categories],
  );

  const feedSourceActions = useFeedSourceActions({
    categories,
    selectedCategory,
    setCategories,
    setSelectedCategory,
    setFeed,
    loadFeedSources,
    fetchFeed,
    fetchCategoryFeeds,
    ensureCategoryLabelExists,
  });

  const addCategory = useCallback(
    (label: string) => {
      const normalized = normalizeCategory(label);
      if (!normalized) {
        toast.error("Category name is required.");
        return false;
      }

      const existing = new Set([
        ...categories.map((node) => normalizeCategoryLabelKey(node.label)),
        ...customCategoryLabels.map((node) => normalizeCategoryLabelKey(node)),
      ]);

      if (existing.has(normalizeCategoryLabelKey(normalized))) {
        toast.error("Category already exists.");
        return false;
      }

      setCustomCategoryLabels((current) => [...current, normalized]);
      toast.success("Category added.");
      return true;
    },
    [categories, customCategoryLabels],
  );

  const assignFeedsToCategory = useCallback(
    async (feedNodes: CategoryTreeNode[], targetCategory: string) => {
      const transferableFeeds = feedNodes.filter((node) =>
        Boolean(node.data?.url),
      );
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
    },
    [],
  );

  const renameCategory = useCallback(
    async (currentLabel: string, nextLabel: string) => {
      const normalizedCurrent = normalizeCategory(currentLabel);
      const normalizedNext = normalizeCategory(nextLabel);

      if (!normalizedCurrent || !normalizedNext) {
        toast.error("Category name is required.");
        return false;
      }

      if (
        normalizeCategoryLabelKey(normalizedCurrent) ===
        normalizeCategoryLabelKey(normalizedNext)
      )
        return false;

      const allLabels = new Set([
        ...categories.map((node) => normalizeCategoryLabelKey(node.label)),
        ...customCategoryLabels.map((node) => normalizeCategoryLabelKey(node)),
      ]);

      if (allLabels.has(normalizeCategoryLabelKey(normalizedNext))) {
        toast.error("Category already exists.");
        return false;
      }

      const categoryNode = categories.find(
        (node) =>
          normalizeCategoryLabelKey(node.label) ===
          normalizeCategoryLabelKey(normalizedCurrent),
      );
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
          current.map((label) =>
            normalizeCategoryLabelKey(label) ===
            normalizeCategoryLabelKey(normalizedCurrent)
              ? normalizedNext
              : label,
          ),
        );
        setOrderedCategoryLabels((current) =>
          current.map((label) =>
            normalizeCategoryLabelKey(label) ===
            normalizeCategoryLabelKey(normalizedCurrent)
              ? normalizedNext
              : label,
          ),
        );

        if (previousSelectedSourceUrl) {
          if (!refreshedCategories)
            refreshedCategories = await loadFeedSources();
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
    },
    [
      categories,
      customCategoryLabels,
      selectedCategory,
      assignFeedsToCategory,
      loadFeedSources,
      setSelectedCategory,
    ],
  );

  const moveCategoryByDrop = useCallback(
    async (label: string, targetIndex: number) => {
      setOrderedCategoryLabels((current) => {
        const currentIndex = current.findIndex(
          (l) =>
            normalizeCategoryLabelKey(l) === normalizeCategoryLabelKey(label),
        );
        if (currentIndex < 0) return current;
        const next = [...current];
        const [moved] = next.splice(currentIndex, 1);
        const safeTargetIndex = Math.max(0, Math.min(targetIndex, next.length));
        const insertionIndex =
          currentIndex < safeTargetIndex
            ? safeTargetIndex - 1
            : safeTargetIndex;
        next.splice(insertionIndex, 0, moved);
        return next;
      });
    },
    [],
  );

  const removeCategory = useCallback(
    async (label: string) => {
      const categoryNode = categories.find(
        (node) =>
          normalizeCategoryLabelKey(node.label) ===
          normalizeCategoryLabelKey(label),
      );
      const feedsInCategory = categoryNode?.children ?? [];

      if (feedsInCategory.length > 0) {
        if (
          normalizeCategoryLabelKey(pendingCategoryRemovalLabel ?? "") !==
          normalizeCategoryLabelKey(label)
        ) {
          setPendingCategoryRemovalLabel(label);
          return false;
        }

        const targetCategory = [
          ...categories.map((n) => n.label),
          ...customCategoryLabels,
        ]
          .map((l) => normalizeCategory(l))
          .find(
            (l) =>
              normalizeCategoryLabelKey(l) !== normalizeCategoryLabelKey(label),
          );

        if (!targetCategory) {
          setPendingCategoryRemovalLabel(null);
          toast.error("Add another category before removing this one.");
          return false;
        }

        ensureCategoryLabelExists(targetCategory);

        try {
          await assignFeedsToCategory(feedsInCategory, targetCategory);
          const refreshedCategories = await loadFeedSources();
          const previousSelectedSourceUrl = flattenCategoryFeeds(
            categories,
          ).find((node) => node.key === selectedCategory)?.data?.url;

          if (previousSelectedSourceUrl) {
            const selectedNode = flattenCategoryFeeds(refreshedCategories).find(
              (node) => node.data?.url === previousSelectedSourceUrl,
            );
            if (selectedNode) setSelectedCategory(selectedNode.key);
          }

          setPendingCategoryRemovalLabel(null);
          toast.success(
            `Category removed. Feeds moved to "${targetCategory}".`,
          );
          return true;
        } catch (err) {
          console.error("Remove category error:", err);
          setPendingCategoryRemovalLabel(null);
          toast.error("Unable to remove category right now.");
          return false;
        }
      }

      setPendingCategoryRemovalLabel(null);
      setCustomCategoryLabels((current) =>
        current.filter(
          (l) =>
            normalizeCategoryLabelKey(l) !== normalizeCategoryLabelKey(label),
        ),
      );
      setOrderedCategoryLabels((current) =>
        current.filter(
          (l) =>
            normalizeCategoryLabelKey(l) !== normalizeCategoryLabelKey(label),
        ),
      );
      toast.success("Category removed.");
      return true;
    },
    [
      categories,
      customCategoryLabels,
      pendingCategoryRemovalLabel,
      selectedCategory,
      ensureCategoryLabelExists,
      assignFeedsToCategory,
      loadFeedSources,
      setSelectedCategory,
    ],
  );

  const importOpmlFeeds = useCallback(
    (entries: Parameters<typeof feedSourceActions.importOpmlFeeds>[0]) =>
      feedSourceActions.importOpmlFeeds(entries, { setCustomCategoryLabels }),
    [feedSourceActions],
  );

  return {
    // State
    customCategoryLabels,
    orderedCategoryLabels,
    setOrderedCategoryLabels,
    pendingCategoryRemovalLabel,
    // Category actions
    ensureCategoryLabelExists,
    addCategory,
    renameCategory,
    moveCategoryByDrop,
    removeCategory,
    // Feed source actions (delegated)
    addFeedSource: feedSourceActions.addFeedSource,
    removeFeedSource: feedSourceActions.removeFeedSource,
    renameFeedSource: feedSourceActions.renameFeedSource,
    moveFeedByDrop: feedSourceActions.moveFeedByDrop,
    selectFeedByKey: feedSourceActions.selectFeedByKey,
    importOpmlFeeds,
  };
}
