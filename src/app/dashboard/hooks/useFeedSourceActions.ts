"use client";

/**
 * Feed-source CRUD: add, remove, rename, import OPML, select, drag-move.
 * Extracted from useCategoryManager so each hook has one responsibility.
 */

import {
  FeedService,
  isValidUrl,
  normalizeCategory,
  type Article,
  type CategoryTreeNode,
  type OpmlFeedImportEntry,
} from "@/lib";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  flattenCategoryFeeds,
  normalizeLabel,
  relocateFeedInCategories,
} from "../helpers/helpers";

interface UseFeedSourceActionsOptions {
  categories: CategoryTreeNode[];
  selectedCategory: string;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (categoryNode: CategoryTreeNode) => Promise<void>;
  ensureCategoryLabelExists: (label: string) => void;
}

export function useFeedSourceActions({
  categories,
  selectedCategory,
  setCategories,
  setSelectedCategory,
  setFeed,
  loadFeedSources,
  fetchFeed,
  fetchCategoryFeeds,
  ensureCategoryLabelExists,
}: UseFeedSourceActionsOptions) {
  const selectFeedByKey = useCallback(
    (feedKey: string) => {
      const sourceNode = flattenCategoryFeeds(categories).find(
        (item) => item.key === feedKey,
      );
      if (!sourceNode?.data?.url) return;
      setSelectedCategory(sourceNode.key);
      void fetchFeed(sourceNode.data.url);
    },
    [categories, setSelectedCategory, fetchFeed],
  );

  const addFeedSource = useCallback(
    async (name: string, url: string, category: string) => {
      if (!name.trim() || !url.trim()) {
        toast.error("Feed name and URL are required.");
        return false;
      }

      if (!isValidUrl(url)) {
        toast.error("Please enter a valid feed URL.");
        return false;
      }

      try {
        await FeedService.createFeedSource({
          name: name.trim(),
          url: url.trim(),
          category: normalizeCategory(category),
        });
        const nextCategories = await loadFeedSources();
        const latestNode = flattenCategoryFeeds(nextCategories).find(
          (node) => node.data?.url === url.trim(),
        );

        if (latestNode?.data?.url) {
          setSelectedCategory(latestNode.key);
          await fetchFeed(latestNode.data.url);
        }

        toast.success("Feed source added.");
        return true;
      } catch (err) {
        console.error("Add feed source error:", err);
        toast.error("Unable to add feed source.");
        return false;
      }
    },
    [loadFeedSources, setSelectedCategory, fetchFeed],
  );

  const removeFeedSource = useCallback(
    async (key: string) => {
      const selectedNode = flattenCategoryFeeds(categories).find(
        (node) => node.key === key,
      );
      const sourceId = selectedNode?.data?.sourceId;

      if (
        typeof sourceId !== "number" ||
        !Number.isInteger(sourceId) ||
        sourceId <= 0
      )
        return;

      try {
        await FeedService.deleteFeedSource(sourceId);
        const nextCategories = await loadFeedSources();
        const nextAvailable = flattenCategoryFeeds(nextCategories);
        const selectedCategoryNode = nextCategories.find(
          (node) => node.key === selectedCategory,
        );

        if (nextAvailable.length === 0) {
          setSelectedCategory("");
          setFeed([]);
        } else if (selectedCategory === key) {
          const fallback = nextAvailable[0];
          setSelectedCategory(fallback.key);
          if (fallback.data?.url) await fetchFeed(fallback.data.url);
        } else if (selectedCategoryNode) {
          await fetchCategoryFeeds(selectedCategoryNode);
        }

        toast.success("Feed source removed.");
      } catch (err) {
        console.error("Remove feed source error:", err);
        toast.error("Unable to remove feed source.");
      }
    },
    [
      categories,
      selectedCategory,
      loadFeedSources,
      setSelectedCategory,
      setFeed,
      fetchFeed,
      fetchCategoryFeeds,
    ],
  );

  const renameFeedSource = useCallback(
    async (key: string, nextName: string) => {
      const selectedNode = flattenCategoryFeeds(categories).find(
        (node) => node.key === key,
      );
      const sourceId = selectedNode?.data?.sourceId;
      const normalizedName = nextName.trim();

      if (!normalizedName) {
        toast.error("Feed name is required.");
        return false;
      }

      if (
        typeof sourceId !== "number" ||
        !Number.isInteger(sourceId) ||
        sourceId <= 0
      ) {
        toast.error("Unable to rename this feed.");
        return false;
      }

      try {
        await FeedService.renameFeedSource(sourceId, normalizedName);
        await loadFeedSources();
        toast.success("Feed source renamed.");
        return true;
      } catch (err) {
        console.error("Rename feed source error:", err);
        toast.error("Unable to rename feed source.");
        return false;
      }
    },
    [categories, loadFeedSources],
  );

  const moveFeedByDrop = useCallback(
    async (key: string, targetCategory: string, targetIndex: number) => {
      const normalizedTargetCategory = normalizeCategory(targetCategory);
      if (!normalizedTargetCategory) return;

      const sourceCategoryNode = categories.find((cat) =>
        (cat.children ?? []).some((node) => node.key === key),
      );
      const sourceNode = flattenCategoryFeeds(categories).find(
        (node) => node.key === key,
      );

      if (!sourceCategoryNode || !sourceNode) return;

      setCategories((prev) =>
        relocateFeedInCategories(
          prev,
          key,
          normalizedTargetCategory,
          targetIndex,
        ),
      );

      if (
        normalizeLabel(sourceCategoryNode.label) ===
        normalizeLabel(normalizedTargetCategory)
      ) {
        return;
      }

      ensureCategoryLabelExists(normalizedTargetCategory);

      try {
        await FeedService.createFeedSource({
          name: sourceNode.label,
          url: sourceNode.data?.url ?? "",
          category: normalizedTargetCategory,
        });
      } catch (err) {
        console.error("Drag move feed category error:", err);
        toast.error("Unable to move feed right now.");
        await loadFeedSources();
      }
    },
    [categories, setCategories, ensureCategoryLabelExists, loadFeedSources],
  );

  const importOpmlFeeds = useCallback(
    async (
      entries: OpmlFeedImportEntry[],
      {
        setCustomCategoryLabels,
      }: {
        setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
      },
    ) => {
      if (entries.length === 0) {
        toast.error("No valid feeds found in OPML file.");
        return;
      }

      const previousSelectedSourceUrl = flattenCategoryFeeds(categories).find(
        (node) => node.key === selectedCategory,
      )?.data?.url;

      let importedCount = 0;
      let failedCount = 0;
      const successfulUrls: string[] = [];
      const importedCategoryLabels = new Set<string>();

      const importResults = await Promise.allSettled(
        entries.map((entry) =>
          FeedService.createFeedSource({
            name: entry.name.trim(),
            url: entry.url.trim(),
            category: normalizeCategory(entry.category),
          }).then(() => ({
            url: entry.url.trim(),
            category: normalizeCategory(entry.category),
          })),
        ),
      );

      for (const result of importResults) {
        if (result.status === "fulfilled") {
          successfulUrls.push(result.value.url);
          importedCategoryLabels.add(result.value.category);
          importedCount += 1;
        } else {
          failedCount += 1;
          console.error("OPML import item failed:", result.reason);
        }
      }

      if (importedCount === 0) {
        toast.error("Unable to import feeds from OPML.");
        return;
      }

      if (importedCategoryLabels.size > 0) {
        setCustomCategoryLabels((current) => {
          const existing = new Set(current.map((l) => normalizeLabel(l)));
          const next = [...current];
          for (const label of importedCategoryLabels) {
            if (!existing.has(normalizeLabel(label))) {
              next.push(label);
              existing.add(normalizeLabel(label));
            }
          }
          return next;
        });
      }

      const nextCategories = await loadFeedSources();
      const restoredSelection = previousSelectedSourceUrl
        ? flattenCategoryFeeds(nextCategories).find(
            (node) => node.data?.url === previousSelectedSourceUrl,
          )
        : null;
      const importedSelection = flattenCategoryFeeds(nextCategories).find(
        (node) => successfulUrls.includes(node.data?.url ?? ""),
      );
      const nextSelection = importedSelection ?? restoredSelection;

      if (nextSelection?.data?.url) {
        setSelectedCategory(nextSelection.key);
        await fetchFeed(nextSelection.data.url);
      }

      toast.success(
        failedCount > 0
          ? `Imported ${importedCount} feeds (${failedCount} skipped).`
          : `Imported ${importedCount} feeds from OPML.`,
      );
    },
    [
      categories,
      selectedCategory,
      loadFeedSources,
      setSelectedCategory,
      fetchFeed,
    ],
  );

  return {
    selectFeedByKey,
    addFeedSource,
    removeFeedSource,
    renameFeedSource,
    moveFeedByDrop,
    importOpmlFeeds,
  };
}
