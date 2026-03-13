import { toast } from "sonner";

import { findFeedNodeByUrl, getFeedUrlBySelectedKey } from "./category-tree";
import type { FeedFetchOptions } from "./selection";

import {
  type CategoryTreeNode,
  FeedService,
  includesCategoryLabel,
  normalizeCategory,
  type OpmlFeedImportEntry,
} from "@/lib";

type CategoryLabelListSetter = React.Dispatch<React.SetStateAction<string[]>>;

interface ImportOpmlFeedsOptions {
  categories: CategoryTreeNode[];
  entries: OpmlFeedImportEntry[];
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setCustomCategoryLabels: CategoryLabelListSetter;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

export async function importOpmlFeedsAndRefresh({
  categories,
  entries,
  fetchFeed,
  loadFeedSources,
  selectedCategory,
  setCustomCategoryLabels,
  setSelectedCategory,
}: ImportOpmlFeedsOptions) {
  if (entries.length === 0) {
    toast.error("No valid feeds found in OPML file.");
    return;
  }

  const previousSelectedSourceUrl = getFeedUrlBySelectedKey(
    categories,
    selectedCategory,
  );

  let importedCount = 0;
  let failedCount = 0;
  const successfulUrls: string[] = [];
  const importedCategoryLabels = new Set<string>();

  const importResults = await Promise.allSettled(
    entries.map((entry) =>
      FeedService.createFeedSource({
        category: normalizeCategory(entry.category),
        name: entry.name.trim(),
        url: entry.url.trim(),
      }).then(() => ({
        category: normalizeCategory(entry.category),
        url: entry.url.trim(),
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
      const next = [...current];
      for (const label of importedCategoryLabels) {
        if (!includesCategoryLabel(next, label)) {
          next.push(label);
        }
      }
      return next;
    });
  }

  const nextCategories = await loadFeedSources();
  const restoredSelection = previousSelectedSourceUrl
    ? findFeedNodeByUrl(nextCategories, previousSelectedSourceUrl)
    : null;
  const importedSelection = successfulUrls
    .map((url) => findFeedNodeByUrl(nextCategories, url))
    .find((node) => node !== undefined);
  const nextSelection = importedSelection ?? restoredSelection;

  if (nextSelection?.data?.url) {
    setSelectedCategory(nextSelection.key);
    await fetchFeed(nextSelection.data.url, {
      forceRefresh: true,
      requestSource: "opml-imported",
    });
  }

  toast.success(
    failedCount > 0
      ? `Imported ${importedCount} feeds (${failedCount} skipped).`
      : `Imported ${importedCount} feeds from OPML.`,
  );
}
