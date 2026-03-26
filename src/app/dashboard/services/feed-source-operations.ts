import { toast } from "sonner";

import {
  type Article,
  type CategoryTreeNode,
  FeedService,
  isSafePositiveItemId,
  isSameCategoryLabel,
  isValidUrl,
  normalizeCategory,
} from "@/lib";

import type { FeedFetchOptions } from "./selection";

import { ALL_FEEDS_NODE_KEY } from "../constants";
import {
  findFeedNodeByKey,
  findFeedNodeByUrl,
  relocateFeedInCategories,
} from "./category-tree";
import {
  normalizeFeedSourceInput,
  resolvePostEnabledToggleSelection,
  resolvePostRemovalSelection,
} from "./feed-source-state";

export async function addFeedSourceAndRefresh({
  category,
  fetchFeed,
  loadFeedSources,
  name,
  setSelectedCategory,
  url,
}: {
  category: string;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  name: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  url: string;
}): Promise<boolean> {
  const normalizedInput = normalizeFeedSourceInput(name, url);

  if (!normalizedInput.name || !normalizedInput.url) {
    toast.error("Feed name and URL are required.");
    return false;
  }

  if (!isValidUrl(normalizedInput.url)) {
    toast.error("Please enter a valid feed URL.");
    return false;
  }

  try {
    await FeedService.createFeedSource({
      category: normalizeCategory(category),
      name: normalizedInput.name,
      url: normalizedInput.url,
    });
    const nextCategories = await loadFeedSources();
    const latestNode = findFeedNodeByUrl(nextCategories, normalizedInput.url);

    if (latestNode?.data?.url) {
      setSelectedCategory(latestNode.key);
      await fetchFeed(latestNode.data.url, {
        forceRefresh: true,
        requestSource: "feed-added",
      });
    }

    return true;
  } catch (err) {
    console.error("Add feed source error:", err);
    toast.error("Unable to add feed source.");
    return false;
  }
}

export async function moveFeedByDropAndPersist({
  categories,
  ensureCategoryLabelExists,
  key,
  loadFeedSources,
  setCategories,
  targetCategory,
  targetIndex,
}: {
  categories: CategoryTreeNode[];
  ensureCategoryLabelExists: (label: string) => void;
  key: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  targetCategory: string;
  targetIndex: number;
}) {
  const normalizedTargetCategory = normalizeCategory(targetCategory);
  if (!normalizedTargetCategory) return;

  const sourceCategoryNode = categories.find((cat) =>
    (cat.children ?? []).some((node) => node.key === key),
  );
  const sourceNode = findFeedNodeByKey(categories, key);

  if (!sourceCategoryNode || !sourceNode) return;

  setCategories((prev) =>
    relocateFeedInCategories(prev, key, normalizedTargetCategory, targetIndex),
  );

  if (isSameCategoryLabel(sourceCategoryNode.label, normalizedTargetCategory)) {
    return;
  }

  ensureCategoryLabelExists(sourceCategoryNode.label);
  ensureCategoryLabelExists(normalizedTargetCategory);

  try {
    await FeedService.createFeedSource({
      category: normalizedTargetCategory,
      name: sourceNode.label,
      url: sourceNode.data?.url ?? "",
    });
  } catch (err) {
    console.error("Drag move feed category error:", err);
    toast.error("Unable to move feed right now.");
    await loadFeedSources();
  }
}

export async function removeFeedSourceAndRefresh({
  categories,
  fetchCategoryFeeds,
  fetchFeed,
  key,
  loadFeedSources,
  selectedCategory,
  setFeed,
  setSelectedCategory,
}: {
  categories: CategoryTreeNode[];
  fetchCategoryFeeds: (categoryNode: CategoryTreeNode) => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  key: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}) {
  const selectedNode = findFeedNodeByKey(categories, key);
  const sourceId = selectedNode?.data?.sourceId;

  if (!isSafePositiveItemId(sourceId)) return;
  const validSourceId = sourceId;

  try {
    await FeedService.deleteFeedSource(validSourceId);
    const nextCategories = await loadFeedSources();
    const nextSelection = resolvePostRemovalSelection(
      nextCategories,
      selectedCategory,
      key,
    );

    if (nextSelection.type === "clear") {
      setSelectedCategory("");
      setFeed([]);
    } else if (nextSelection.type === "feed") {
      if (nextSelection.nextSelectedCategory) {
        setSelectedCategory(nextSelection.nextSelectedCategory);
      }
      await fetchFeed(nextSelection.feedUrl);
    } else if (nextSelection.type === "category") {
      await fetchCategoryFeeds(nextSelection.categoryNode);
    }
  } catch (err) {
    console.error("Remove feed source error:", err);
    toast.error("Unable to remove feed source.");
  }
}

export async function renameFeedSourceAndRefresh({
  categories,
  key,
  loadFeedSources,
  nextName,
  nextUrl,
}: {
  categories: CategoryTreeNode[];
  key: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  nextName: string;
  nextUrl: string;
}): Promise<boolean> {
  const selectedNode = findFeedNodeByKey(categories, key);
  const sourceId = selectedNode?.data?.sourceId;
  const normalizedName = nextName.trim();
  const normalizedUrl = nextUrl.trim();

  if (!normalizedName) {
    toast.error("Feed name is required.");
    return false;
  }

  if (!normalizedUrl || !isValidUrl(normalizedUrl)) {
    toast.error("Please enter a valid feed URL.");
    return false;
  }

  if (!isSafePositiveItemId(sourceId)) {
    toast.error("Unable to rename this feed.");
    return false;
  }
  const validSourceId = sourceId;

  try {
    await FeedService.renameFeedSource(
      validSourceId,
      normalizedName,
      normalizedUrl,
    );
    await loadFeedSources();
    toast.success("Feed source updated.");
    return true;
  } catch (err) {
    console.error("Update feed source error:", err);
    toast.error("Unable to update feed source.");
    return false;
  }
}

export function selectFeedByKeyFromCategories(
  categories: CategoryTreeNode[],
  feedKey: string,
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>,
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>,
) {
  const sourceNode = findFeedNodeByKey(categories, feedKey);
  if (!sourceNode?.data?.url) return;

  setSelectedCategory(sourceNode.key);
  void fetchFeed(sourceNode.data.url);
}

export async function setFeedSourceEnabledAndRefresh({
  categories,
  enabled,
  fetchAllFeeds,
  fetchFeed,
  key,
  loadFeedSources,
  selectedCategory,
  setSelectedCategory,
}: {
  categories: CategoryTreeNode[];
  enabled: boolean;
  fetchAllFeeds: (
    categories?: CategoryTreeNode[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  key: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}): Promise<boolean> {
  const sourceNode = findFeedNodeByKey(categories, key);
  const sourceId = sourceNode?.data?.sourceId;
  const sourceUrl = sourceNode?.data?.url;

  if (!isSafePositiveItemId(sourceId)) {
    toast.error("Unable to update this feed.");
    return false;
  }

  try {
    await FeedService.setFeedSourceEnabled(sourceId, enabled);
    const nextCategories = await loadFeedSources();
    const nextSelection = resolvePostEnabledToggleSelection(
      nextCategories,
      selectedCategory,
      sourceUrl,
      enabled,
      key,
    );

    if (nextSelection.type === "all-feeds") {
      setSelectedCategory(ALL_FEEDS_NODE_KEY);
      await fetchAllFeeds(nextCategories, {
        requestSource: "feed-hidden-selection-fallback",
      });
    } else if (nextSelection.type === "feed") {
      await fetchFeed(nextSelection.feedUrl, {
        forceRefresh: true,
        requestSource: "feed-reenabled",
      });
    }

    return true;
  } catch (err) {
    console.error("Toggle feed source enabled error:", err);
    toast.error("Unable to update feed state.");
    return false;
  }
}

export async function updateFeedSettingsAndRefresh({
  categories,
  key,
  loadFeedSources,
  settings,
}: {
  categories: CategoryTreeNode[];
  key: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  settings: { extractionDisabled?: boolean; proxyEnabled?: boolean };
}): Promise<boolean> {
  const sourceNode = findFeedNodeByKey(categories, key);
  const sourceId = sourceNode?.data?.sourceId;

  if (!isSafePositiveItemId(sourceId)) {
    toast.error("Unable to update this feed.");
    return false;
  }

  try {
    await FeedService.updateFeedSettings(sourceId, settings);
    await loadFeedSources();
    return true;
  } catch (err) {
    console.error("Update feed settings error:", err);
    toast.error("Unable to update feed settings.");
    return false;
  }
}
