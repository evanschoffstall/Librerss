import { toast } from "sonner";

import type { FeedFetchOptions } from "@/app/dashboard/services/selection";
import type { Article, CategoryTreeNode } from "@/lib/core";

import {
  findFeedNodeByKey,
  findFeedNodeByUrl,
  relocateFeedInCategories,
} from "@/app/dashboard/services/category-tree";
import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/services/dashboard-constants";
import {
  normalizeFeedSourceInput,
  resolvePostEnabledToggleSelection,
  resolvePostRemovalSelection,
} from "@/app/dashboard/services/feed-data/source/state";
import { FeedService, isApiError } from "@/lib/api";
import {
  isSafePositiveItemId,
  isSameCategoryLabel,
  isValidUrl,
  normalizeCategory,
} from "@/lib/utils";

/**
 * Describes the options for add feed source and refresh.
 */
interface AddFeedSourceAndRefreshOptions {
  category: string;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  loadFeedSources: (options?: {
    forceFresh?: boolean;
  }) => Promise<CategoryTreeNode[]>;
  name: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  url: string;
}

/**
 * Describes the options for apply post enabled selection.
 */
interface ApplyPostEnabledSelectionOptions {
  fetchAllFeeds: (
    categories?: CategoryTreeNode[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  nextCategories: CategoryTreeNode[];
  nextSelection: ReturnType<typeof resolvePostEnabledToggleSelection>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}
/**
 * Describes the options for apply post removal selection.
 */
interface ApplyPostRemovalSelectionOptions {
  fetchCategoryFeeds: (categoryNode: CategoryTreeNode) => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  nextSelection: ReturnType<typeof resolvePostRemovalSelection>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * Describes the options for feed settings and refresh.
 */
interface FeedSettingsAndRefreshOptions {
  categories: CategoryTreeNode[];
  key: string;
  loadFeedSources: (options?: {
    forceFresh?: boolean;
  }) => Promise<CategoryTreeNode[]>;
  settings: { extractionDisabled?: boolean; proxyEnabled?: boolean };
}
/**
 * Describes the options for move feed by drop and persist.
 */
interface MoveFeedByDropAndPersistOptions {
  categories: CategoryTreeNode[];
  ensureCategoryLabelExists: (label: string) => void;
  key: string;
  loadFeedSources: (options?: {
    forceFresh?: boolean;
  }) => Promise<CategoryTreeNode[]>;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  targetCategory: string;
  targetIndex: number;
}

/**
 * Describes the options for refresh added feed selection.
 */
interface RefreshAddedFeedSelectionOptions {
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  nextCategories: CategoryTreeNode[];
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  url: string;
}
/**
 * Describes the options for remove feed source and refresh.
 */
interface RemoveFeedSourceAndRefreshOptions {
  categories: CategoryTreeNode[];
  fetchCategoryFeeds: (categoryNode: CategoryTreeNode) => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  key: string;
  loadFeedSources: (options?: {
    forceFresh?: boolean;
  }) => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * Describes the options for rename feed source and refresh.
 */
interface RenameFeedSourceAndRefreshOptions {
  categories: CategoryTreeNode[];
  key: string;
  loadFeedSources: (options?: {
    forceFresh?: boolean;
  }) => Promise<CategoryTreeNode[]>;
  nextName: string;
  nextUrl: string;
}

/**
 * Describes the options for set feed source enabled and refresh.
 */
interface SetFeedSourceEnabledAndRefreshOptions {
  categories: CategoryTreeNode[];
  enabled: boolean;
  fetchAllFeeds: (
    categories?: CategoryTreeNode[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  key: string;
  loadFeedSources: (options?: {
    forceFresh?: boolean;
  }) => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * Process the add feed source and refresh.
 * @param options - The options used to process the add feed source and refresh.
 * @returns The add feed source and refresh.
 */
export async function addFeedSourceAndRefresh(
  options: AddFeedSourceAndRefreshOptions,
): Promise<boolean> {
  const {
    category,
    fetchFeed,
    loadFeedSources,
    name,
    setSelectedCategory,
    url,
  } = options;
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
    const nextCategories = await loadFeedSources({ forceFresh: true });
    await refreshAddedFeedSelection({
      fetchFeed,
      nextCategories,
      setSelectedCategory,
      url: normalizedInput.url,
    });

    return true;
  } catch (err) {
    console.error("Add feed source error:", err);
    toast.error(
      getAddFeedSourceErrorMessage(err) ?? "Unable to add feed source.",
    );
    return false;
  }
}

/**
 * Process the move feed by drop and persist.
 * @param options - The options used to process the move feed by drop and persist.
 */
export async function moveFeedByDropAndPersist(
  options: MoveFeedByDropAndPersistOptions,
) {
  const {
    categories,
    ensureCategoryLabelExists,
    key,
    loadFeedSources,
    setCategories,
    targetCategory,
    targetIndex,
  } = options;
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

/**
 * Process the remove feed source and refresh.
 * @param options - The options used to process the remove feed source and refresh.
 */
export async function removeFeedSourceAndRefresh(
  options: RemoveFeedSourceAndRefreshOptions,
) {
  const {
    categories,
    fetchCategoryFeeds,
    fetchFeed,
    key,
    loadFeedSources,
    selectedCategory,
    setFeed,
    setSelectedCategory,
  } = options;
  const selectedNode = findFeedNodeByKey(categories, key);
  const sourceId = selectedNode?.data?.sourceId;

  if (!isSafePositiveItemId(sourceId)) return;
  const validSourceId = sourceId;

  try {
    await FeedService.deleteFeedSource(validSourceId);
    const nextCategories = await loadFeedSources({ forceFresh: true });
    const nextSelection = resolvePostRemovalSelection(
      nextCategories,
      selectedCategory,
      key,
    );
    await applyPostRemovalSelection({
      fetchCategoryFeeds,
      fetchFeed,
      nextSelection,
      setFeed,
      setSelectedCategory,
    });
  } catch (err) {
    console.error("Remove feed source error:", err);
    toast.error("Unable to remove feed source.");
  }
}
/**
 * Process the rename feed source and refresh.
 * @param options - The options used to process the rename feed source and refresh.
 * @returns The rename feed source and refresh.
 */
export async function renameFeedSourceAndRefresh(
  options: RenameFeedSourceAndRefreshOptions,
): Promise<boolean> {
  const { categories, key, loadFeedSources, nextName, nextUrl } = options;
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
    await loadFeedSources({ forceFresh: true });
    toast.success("Feed source updated.");
    return true;
  } catch (err) {
    console.error("Update feed source error:", err);
    toast.error("Unable to update feed source.");
    return false;
  }
}

/**
 * Process the select feed by key from categories.
 * @param categories - The categories.
 * @param feedKey - The feed key.
 * @param setSelectedCategory - The set selected category.
 * @param fetchFeed - Callback that fetches a single feed source by URL.
 */
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
/**
 * Process the set feed source enabled and refresh.
 * @param options - The options used to process the set feed source enabled and refresh.
 * @returns The set feed source enabled and refresh.
 */
export async function setFeedSourceEnabledAndRefresh(
  options: SetFeedSourceEnabledAndRefreshOptions,
): Promise<boolean> {
  const {
    categories,
    enabled,
    fetchAllFeeds,
    fetchFeed,
    key,
    loadFeedSources,
    selectedCategory,
    setSelectedCategory,
  } = options;
  const sourceReference = getFeedSourceReference(categories, key);
  const sourceId = sourceReference.sourceId;

  if (!isSafePositiveItemId(sourceId)) {
    toast.error("Unable to update this feed.");
    return false;
  }

  try {
    await FeedService.setFeedSourceEnabled(sourceId, enabled);
    const nextCategories = await loadFeedSources({ forceFresh: true });
    const nextSelection = resolvePostEnabledToggleSelection(
      nextCategories,
      selectedCategory,
      sourceReference.sourceUrl,
      enabled,
      key,
    );
    await applyPostEnabledSelection({
      fetchAllFeeds,
      fetchFeed,
      nextCategories,
      nextSelection,
      setSelectedCategory,
    });

    return true;
  } catch (err) {
    console.error("Toggle feed source enabled error:", err);
    toast.error("Unable to update feed state.");
    return false;
  }
}

/**
 * Update the feed settings and refresh.
 * @param options - The options used to update the feed settings and refresh.
 * @returns The feed settings and refresh.
 */
export async function updateFeedSettingsAndRefresh(
  options: FeedSettingsAndRefreshOptions,
): Promise<boolean> {
  const { categories, key, loadFeedSources, settings } = options;
  const sourceId = getFeedSourceReference(categories, key).sourceId;

  if (!isSafePositiveItemId(sourceId)) {
    toast.error("Unable to update this feed.");
    return false;
  }

  try {
    await FeedService.updateFeedSettings(sourceId, settings);
    await loadFeedSources({ forceFresh: true });
    return true;
  } catch (err) {
    console.error("Update feed settings error:", err);
    toast.error("Unable to update feed settings.");
    return false;
  }
}
/**
 * Process the apply post enabled selection.
 * @param options - The options used to process the apply post enabled selection.
 */
async function applyPostEnabledSelection(
  options: ApplyPostEnabledSelectionOptions,
) {
  const {
    fetchAllFeeds,
    fetchFeed,
    nextCategories,
    nextSelection,
    setSelectedCategory,
  } = options;
  if (nextSelection.type === "all-feeds") {
    setSelectedCategory(ALL_FEEDS_NODE_KEY);
    await fetchAllFeeds(nextCategories, {
      requestSource: "feed-hidden-selection-fallback",
    });
    return;
  }

  if (nextSelection.type === "feed") {
    await fetchFeed(nextSelection.feedUrl, {
      forceRefresh: true,
      requestSource: "feed-reenabled",
    });
  }
}

/**
 * Process the apply post removal selection.
 * @param options - The options used to process the apply post removal selection.
 */
async function applyPostRemovalSelection(
  options: ApplyPostRemovalSelectionOptions,
) {
  const {
    fetchCategoryFeeds,
    fetchFeed,
    nextSelection,
    setFeed,
    setSelectedCategory,
  } = options;
  if (nextSelection.type === "clear") {
    setSelectedCategory("");
    setFeed([]);
    return;
  }

  if (nextSelection.type === "feed") {
    if (nextSelection.nextSelectedCategory) {
      setSelectedCategory(nextSelection.nextSelectedCategory);
    }

    await fetchFeed(nextSelection.feedUrl);
    return;
  }

  if (nextSelection.type === "category") {
    await fetchCategoryFeeds(nextSelection.categoryNode);
  }
}

/**
 * Extract a user-facing error message from a failed add-feed request when the
 * server returned a validated JSON error payload.
 * @param error - Unknown error thrown by the feed-service client.
 * @returns The normalized server error string, or `null` when unavailable.
 */
function getAddFeedSourceErrorMessage(error: unknown): null | string {
  if (!isApiError<{ error?: unknown }>(error)) {
    return null;
  }

  const responseData = error.response?.data;
  if (responseData === undefined) {
    return null;
  }

  const { error: message } = responseData;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : null;
}
/**
 * Return the feed source reference.
 * @param categories - The categories.
 * @param key - The key.
 * @returns The feed source reference.
 */
function getFeedSourceReference(categories: CategoryTreeNode[], key: string) {
  const sourceNode = findFeedNodeByKey(categories, key);

  return {
    sourceId: sourceNode?.data?.sourceId,
    sourceUrl: sourceNode?.data?.url,
  };
}

/**
 * Process the refresh added feed selection.
 * @param options - The options used to process the refresh added feed selection.
 */
async function refreshAddedFeedSelection(
  options: RefreshAddedFeedSelectionOptions,
) {
  const { fetchFeed, nextCategories, setSelectedCategory, url } = options;
  const latestNode = findFeedNodeByUrl(nextCategories, url);

  if (!latestNode?.data?.url) {
    return;
  }

  setSelectedCategory(latestNode.key);
  await fetchFeed(latestNode.data.url, {
    forceRefresh: true,
    requestSource: "feed-added",
  });
}
