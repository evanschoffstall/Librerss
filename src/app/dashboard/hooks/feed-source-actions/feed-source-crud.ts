import {
  FeedService,
  isSafePositiveItemId,
  isSameCategoryLabel,
  isValidUrl,
  normalizeCategory,
  type Article,
  type CategoryTreeNode,
} from "@/lib";
import { toast } from "sonner";
import {
  findFeedNodeByKey,
  findFeedNodeByUrl,
  getAllFeedNodes,
  getFirstFeedNode,
} from "../../services/category-feeds";
import { relocateFeedInCategories } from "../../services/category-tree";

export function selectFeedByKeyFromCategories(
  categories: CategoryTreeNode[],
  feedKey: string,
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>,
  fetchFeed: (url: string) => Promise<void>,
) {
  const sourceNode = findFeedNodeByKey(categories, feedKey);
  if (!sourceNode?.data?.url) return;

  setSelectedCategory(sourceNode.key);
  void fetchFeed(sourceNode.data.url);
}

export async function addFeedSourceAndRefresh({
  name,
  url,
  category,
  loadFeedSources,
  setSelectedCategory,
  fetchFeed,
}: {
  name: string;
  url: string;
  category: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  fetchFeed: (url: string) => Promise<void>;
}): Promise<boolean> {
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
    const latestNode = findFeedNodeByUrl(nextCategories, url.trim());

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
}

export async function removeFeedSourceAndRefresh({
  categories,
  selectedCategory,
  key,
  loadFeedSources,
  setSelectedCategory,
  setFeed,
  fetchFeed,
  fetchCategoryFeeds,
}: {
  categories: CategoryTreeNode[];
  selectedCategory: string;
  key: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (categoryNode: CategoryTreeNode) => Promise<void>;
}) {
  const selectedNode = findFeedNodeByKey(categories, key);
  const sourceId = selectedNode?.data?.sourceId;

  if (!isSafePositiveItemId(sourceId)) return;
  const validSourceId = sourceId;

  try {
    await FeedService.deleteFeedSource(validSourceId);
    const nextCategories = await loadFeedSources();
    const nextAvailable = getAllFeedNodes(nextCategories);
    const selectedFeedNode = findFeedNodeByKey(
      nextCategories,
      selectedCategory,
    );
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
    } else if (selectedFeedNode?.data?.url) {
      await fetchFeed(selectedFeedNode.data.url);
    } else if (selectedCategoryNode) {
      await fetchCategoryFeeds(selectedCategoryNode);
    } else {
      const fallback = getFirstFeedNode(nextCategories);
      if (!fallback) {
        return;
      }
      setSelectedCategory(fallback.key);
      if (fallback.data?.url) await fetchFeed(fallback.data.url);
    }

    toast.success("Feed source removed.");
  } catch (err) {
    console.error("Remove feed source error:", err);
    toast.error("Unable to remove feed source.");
  }
}

export async function renameFeedSourceAndRefresh({
  categories,
  key,
  nextName,
  nextUrl,
  loadFeedSources,
}: {
  categories: CategoryTreeNode[];
  key: string;
  nextName: string;
  nextUrl: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
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

export async function moveFeedByDropAndPersist({
  categories,
  key,
  targetCategory,
  targetIndex,
  setCategories,
  ensureCategoryLabelExists,
  loadFeedSources,
}: {
  categories: CategoryTreeNode[];
  key: string;
  targetCategory: string;
  targetIndex: number;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  ensureCategoryLabelExists: (label: string) => void;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
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
      name: sourceNode.label,
      url: sourceNode.data?.url ?? "",
      category: normalizedTargetCategory,
    });
  } catch (err) {
    console.error("Drag move feed category error:", err);
    toast.error("Unable to move feed right now.");
    await loadFeedSources();
  }
}
