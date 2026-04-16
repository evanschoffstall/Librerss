import { toast } from "sonner";

import type { FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";
import type { CategoryTreeNode } from "@/lib/core";

import {
  findFeedNodeByUrl,
  getFeedUrlBySelectedKey,
} from "@/app/dashboard/dashboard-services/category-tree";
import { FeedService } from "@/lib/api";
import {
  includesCategoryLabel,
  normalizeCategory,
  type OpmlFeedImportEntry,
} from "@/lib/utils";

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

  const { failedCount, importedCount } = collectImportedFeedResults({
    importedCategoryLabels,
    importResults,
    successfulUrls,
  });

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
  await refreshImportedSelection({
    fetchFeed,
    nextCategories,
    previousSelectedSourceUrl,
    setSelectedCategory,
    successfulUrls,
  });

  toast.success(
    failedCount > 0
      ? `Imported ${importedCount} feeds (${failedCount} skipped).`
      : `Imported ${importedCount} feeds from OPML.`,
  );
}

function collectImportedFeedResults({
  importedCategoryLabels,
  importResults,
  successfulUrls,
}: {
  importedCategoryLabels: Set<string>;
  importResults: PromiseSettledResult<{ category: string; url: string }>[];
  successfulUrls: string[];
}) {
  let importedCount = 0;
  let failedCount = 0;

  for (const result of importResults) {
    if (result.status === "fulfilled") {
      successfulUrls.push(result.value.url);
      importedCategoryLabels.add(result.value.category);
      importedCount += 1;
      continue;
    }

    failedCount += 1;
    console.error("OPML import item failed:", result.reason);
  }

  return { failedCount, importedCount };
}

async function refreshImportedSelection({
  fetchFeed,
  nextCategories,
  previousSelectedSourceUrl,
  setSelectedCategory,
  successfulUrls,
}: {
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  nextCategories: CategoryTreeNode[];
  previousSelectedSourceUrl: null | string | undefined;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  successfulUrls: string[];
}) {
  const restoredSelection = previousSelectedSourceUrl
    ? findFeedNodeByUrl(nextCategories, previousSelectedSourceUrl)
    : null;
  const importedSelection = successfulUrls
    .map((url) => findFeedNodeByUrl(nextCategories, url))
    .find((node) => node !== undefined);
  const nextSelection = importedSelection ?? restoredSelection;

  if (!nextSelection?.data?.url) {
    return;
  }

  setSelectedCategory(nextSelection.key);
  await fetchFeed(nextSelection.data.url, {
    forceRefresh: true,
    requestSource: "opml-imported",
  });
}
