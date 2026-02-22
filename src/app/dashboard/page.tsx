"use client";

import { DebugBorder, DebugGrid } from "@/components";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArticleService,
  AuthService,
  ENV,
  FeedService,
  isValidUrl,
  type Article,
  type AuthUser,
  type CategoryTreeNode,
  type OpmlFeedImportEntry,
} from "@/lib";
import { useLocalStorage } from "@/lib/core/clientHooks";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArticleCard, FeedCategory, LoginView, SettingsModal, SettingsView } from "./components";
import {
  ALL_FEEDS_LABEL,
  ALL_FEEDS_NODE_KEY,
  DEFAULT_CATEGORY_LABEL,
  DEFAULT_FEED_URL,
  DEV_PLACEHOLDER_CATEGORY_LABEL,
  DEV_PLACEHOLDER_FEED_SOURCES,
  INITIAL_CATEGORIES,
  getDevPlaceholderArticlesForSource
} from "./constants";

const toCategoryKey = (label: string) =>
  `cat-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default"}`;

const normalizeLabel = (label: string) => label.trim().toLowerCase();

const canonicalizeCategoryLabel = (label?: string | null) => {
  const trimmedLabel = label?.trim();
  if (!trimmedLabel) {
    return DEFAULT_CATEGORY_LABEL;
  }

  const normalized = normalizeLabel(trimmedLabel);
  if (
    normalized === "uncategorized" ||
    normalized === "uncategorised" ||
    normalized === "uncategoried"
  ) {
    return DEFAULT_CATEGORY_LABEL;
  }

  return trimmedLabel;
};

const panelMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

const flattenCategoryFeeds = (nodes: CategoryTreeNode[]) =>
  nodes.flatMap((category) => category.children ?? []);

const dedupeAndSortArticles = (articles: Article[]) => {
  const uniqueArticles = new Map<string, Article>();

  for (const article of articles) {
    // Always require link - skip articles without it
    if (!article.link?.trim()) {
      // Avoid logging user content (article titles) to the browser console.
      continue;
    }

    const key = article.link.trim();
    const existing = uniqueArticles.get(key);

    if (!existing) {
      uniqueArticles.set(key, article);
      continue;
    }

    // Keep article with longer content, or newer publication date
    const shouldReplace =
      (article.content?.length ?? 0) > (existing.content?.length ?? 0) ||
      (article.content?.length === existing.content?.length &&
        new Date(article.publicationDate).getTime() >
        new Date(existing.publicationDate).getTime());

    if (shouldReplace) {
      uniqueArticles.set(key, article);
    }
  }

  return [...uniqueArticles.values()].sort((a, b) => {
    const aTime = new Date(a.publicationDate).getTime();
    const bTime = new Date(b.publicationDate).getTime();
    return bTime - aTime;
  });
};

const getArticleKey = (article: Article) => article.link.trim();

const buildCategoriesFromSources = (
  sources: Array<{ id: number; name: string; url: string; category?: string | null }>,
): CategoryTreeNode[] => {
  const grouped = new Map<string, CategoryTreeNode[]>();

  for (const source of sources) {
    const categoryLabel = canonicalizeCategoryLabel(source.category);
    const current = grouped.get(categoryLabel) ?? [];

    current.push({
      key: `${toCategoryKey(categoryLabel)}-${source.id}`,
      label: source.name,
      data: { url: source.url, sourceId: source.id, category: categoryLabel },
    });

    grouped.set(categoryLabel, current);
  }

  return [...grouped.entries()].map(([label, children]) => ({
    key: toCategoryKey(label),
    label,
    children,
  }));
};

const buildDefaultCategories = (usePlaceholderData: boolean): CategoryTreeNode[] => {
  if (!usePlaceholderData) {
    return INITIAL_CATEGORIES;
  }

  return [
    {
      key: toCategoryKey(DEV_PLACEHOLDER_CATEGORY_LABEL),
      label: DEV_PLACEHOLDER_CATEGORY_LABEL,
      children: DEV_PLACEHOLDER_FEED_SOURCES.map((source, index) => ({
        key: `${toCategoryKey(DEV_PLACEHOLDER_CATEGORY_LABEL)}-dev-${index}`,
        label: source.name,
        data: { url: source.url, category: source.category },
      })),
    },
  ];
};

const SYSTEM_ALL_FEEDS_CATEGORY: CategoryTreeNode = {
  key: ALL_FEEDS_NODE_KEY,
  label: ALL_FEEDS_LABEL,
  data: { url: "" },
  children: [],
};

interface FeedBatchSource {
  url: string;
  name: string | undefined;
}

const DashboardView = ({ usePlaceholderData }: { usePlaceholderData: boolean }) => {
  const [feed, setFeed] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState(ALL_FEEDS_NODE_KEY);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedArticleKey, setExpandedArticleKey] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [customCategoryLabels, setCustomCategoryLabels] = useState<string[]>([]);
  const [orderedCategoryLabels, setOrderedCategoryLabels] = useState<string[]>([]);
  const [pendingCategoryRemovalLabel, setPendingCategoryRemovalLabel] = useState<string | null>(
    null,
  );
  const latestFeedRequestIdRef = useRef(0);
  const hydratedArticleLinksRef = useRef(new Set<string>());
  const articleHydrationInFlightRef = useRef(new Set<string>());
  const [hydratedArticleLinks, setHydratedArticleLinks] = useState<Record<string, boolean>>({});
  const [hydratingArticleLinks, setHydratingArticleLinks] = useState<Record<string, boolean>>({});
  const [pageSize, setPageSize] = useLocalStorage<number>("librerss:pageSize", 25);
  const [showFavicons, setShowFavicons] = useLocalStorage<boolean>("librerss:showFavicons", true);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const ensureCategoryLabelExists = (label: string) => {
    const normalized = normalizeLabel(label);

    setCustomCategoryLabels((current) => {
      if (current.some((currentLabel) => normalizeLabel(currentLabel) === normalized)) {
        return current;
      }

      if (categories.some((node) => normalizeLabel(node.label) === normalized)) {
        return current;
      }

      return [...current, label];
    });

    setOrderedCategoryLabels((current) => {
      if (current.some((currentLabel) => normalizeLabel(currentLabel) === normalized)) {
        return current;
      }

      return [...current, label];
    });
  };

  const loadFeedSources = async (): Promise<CategoryTreeNode[]> => {
    try {
      const sources = await FeedService.getFeedSources();

      if (sources.length === 0) {
        const defaults = buildDefaultCategories(usePlaceholderData);
        setCategories(defaults);
        return defaults;
      }

      const nextCategories = buildCategoriesFromSources(sources);

      setCategories(nextCategories);
      return nextCategories;
    } catch (err) {
      console.error("Feed source fetch error:", err);
      return buildDefaultCategories(usePlaceholderData);
    }
  };

  const selectFeedByKey = (feedKey: string) => {
    const sourceNode = flattenCategoryFeeds(categories).find((item) => item.key === feedKey);
    if (!sourceNode?.data?.url) {
      return;
    }

    setSelectedCategory(sourceNode.key);
    fetchFeed(sourceNode.data.url);
  };

  const addFeedSource = async (name: string, url: string, category: string) => {
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
        category: canonicalizeCategoryLabel(category),
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
  };

  const removeFeedSource = async (key: string) => {
    const selectedNode = flattenCategoryFeeds(categories).find((node) => node.key === key);
    const sourceId = selectedNode?.data?.sourceId;

    if (typeof sourceId !== "number" || !Number.isInteger(sourceId) || sourceId <= 0) {
      return;
    }

    try {
      await FeedService.deleteFeedSource(sourceId);
      const nextCategories = await loadFeedSources();
      const nextAvailable = flattenCategoryFeeds(nextCategories);
      const selectedCategoryNode = nextCategories.find((node) => node.key === selectedCategory);

      if (nextAvailable.length === 0) {
        setSelectedCategory("");
        setFeed([]);
      } else if (selectedCategory === key) {
        const fallback = nextAvailable[0];
        setSelectedCategory(fallback.key);
        if (fallback.data?.url) {
          await fetchFeed(fallback.data.url);
        }
      } else if (selectedCategoryNode) {
        await fetchCategoryFeeds(selectedCategoryNode);
      }

      toast.success("Feed source removed.");
    } catch (err) {
      console.error("Remove feed source error:", err);
      toast.error("Unable to remove feed source.");
    }
  };

  const renameFeedSource = async (key: string, nextName: string) => {
    const selectedNode = flattenCategoryFeeds(categories).find((node) => node.key === key);
    const sourceId = selectedNode?.data?.sourceId;
    const normalizedName = nextName.trim();

    if (!normalizedName) {
      toast.error("Feed name is required.");
      return false;
    }

    if (typeof sourceId !== "number" || !Number.isInteger(sourceId) || sourceId <= 0) {
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
  };

  const moveFeedByDrop = async (key: string, targetCategory: string, targetIndex: number) => {
    const normalizedTargetCategory = canonicalizeCategoryLabel(targetCategory);
    if (!normalizedTargetCategory) {
      return;
    }

    const sourceCategoryNode = categories.find((categoryNode) =>
      (categoryNode.children ?? []).some((source: CategoryTreeNode) => source.key === key),
    );
    const sourceNode = flattenCategoryFeeds(categories).find((node) => node.key === key);

    if (!sourceCategoryNode || !sourceNode) {
      return;
    }

    setCategories((currentCategories) => {
      const sourceCategoryIndex = currentCategories.findIndex((categoryNode) =>
        (categoryNode.children ?? []).some((source: CategoryTreeNode) => source.key === key),
      );
      let destinationCategoryIndex = currentCategories.findIndex(
        (categoryNode) => normalizeLabel(categoryNode.label) === normalizeLabel(normalizedTargetCategory),
      );

      if (sourceCategoryIndex < 0) {
        return currentCategories;
      }

      const nextCategories = currentCategories.map((categoryNode) => ({
        ...categoryNode,
        children: [...(categoryNode.children ?? [])],
      }));

      if (destinationCategoryIndex < 0) {
        nextCategories.push({
          key: toCategoryKey(normalizedTargetCategory),
          label: normalizedTargetCategory,
          children: [],
        });
        destinationCategoryIndex = nextCategories.length - 1;
      }

      const sourceFeeds = nextCategories[sourceCategoryIndex].children ?? [];
      const sourceFeedIndex = sourceFeeds.findIndex((source: CategoryTreeNode) => source.key === key);

      if (sourceFeedIndex < 0) {
        return currentCategories;
      }

      const [movedSource] = sourceFeeds.splice(sourceFeedIndex, 1);
      const destinationFeeds = nextCategories[destinationCategoryIndex].children ?? [];

      const safeTargetIndex = Math.max(0, Math.min(targetIndex, destinationFeeds.length));
      const insertionIndex =
        sourceCategoryIndex === destinationCategoryIndex && sourceFeedIndex < safeTargetIndex
          ? safeTargetIndex - 1
          : safeTargetIndex;

      destinationFeeds.splice(insertionIndex, 0, {
        ...movedSource,
        data: {
          ...(movedSource.data ?? { url: "" }),
          category: nextCategories[destinationCategoryIndex].label,
        },
      });

      return nextCategories;
    });

    if (normalizeLabel(sourceCategoryNode.label) === normalizeLabel(normalizedTargetCategory)) {
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
  };

  const importOpmlFeeds = async (entries: OpmlFeedImportEntry[]) => {
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

    // Import feeds concurrently — serial awaits in a for…of loop blocked UI
    // for large OPML files (e.g. 200 feeds × 12 s timeout ≈ 40 min).
    const importResults = await Promise.allSettled(
      entries.map((entry) =>
        FeedService.createFeedSource({
          name: entry.name.trim(),
          url: entry.url.trim(),
          category: canonicalizeCategoryLabel(entry.category),
        }).then(() => ({
          url: entry.url.trim(),
          category: canonicalizeCategoryLabel(entry.category),
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
        const existing = new Set(current.map((label) => normalizeLabel(label)));
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
    const importedSelection = flattenCategoryFeeds(nextCategories).find((node) =>
      successfulUrls.includes(node.data?.url ?? ""),
    );
    const nextSelection = importedSelection ?? restoredSelection;

    if (nextSelection?.data?.url) {
      setSelectedCategory(nextSelection.key);
      await fetchFeed(nextSelection.data.url);
    }

    if (failedCount > 0) {
      toast.success(`Imported ${importedCount} feeds (${failedCount} skipped).`);
      return;
    }

    toast.success(`Imported ${importedCount} feeds from OPML.`);
  };

  const addCategory = (label: string) => {
    const normalized = canonicalizeCategoryLabel(label);
    if (!normalized) {
      toast.error("Category name is required.");
      return false;
    }

    const existing = new Set([
      ...categories.map((node) => normalizeLabel(node.label)),
      ...customCategoryLabels.map((node) => normalizeLabel(node)),
    ]);

    if (existing.has(normalizeLabel(normalized))) {
      toast.error("Category already exists.");
      return false;
    }

    setCustomCategoryLabels((current) => [...current, normalized]);
    toast.success("Category added.");
    return true;
  };

  const assignFeedsToCategory = async (
    feedNodes: CategoryTreeNode[],
    targetCategory: string,
  ) => {
    const transferableFeeds = feedNodes.filter((feedNode: CategoryTreeNode) =>
      Boolean(feedNode.data?.url),
    );

    if (transferableFeeds.length === 0) {
      return;
    }

    await Promise.all(
      transferableFeeds.map((feedNode: CategoryTreeNode) =>
        FeedService.createFeedSource({
          name: feedNode.label,
          url: feedNode.data?.url ?? "",
          category: targetCategory,
        }),
      ),
    );
  };

  const renameCategory = async (currentLabel: string, nextLabel: string) => {
    const normalizedCurrent = canonicalizeCategoryLabel(currentLabel);
    const normalizedNext = canonicalizeCategoryLabel(nextLabel);

    if (!normalizedCurrent || !normalizedNext) {
      toast.error("Category name is required.");
      return false;
    }

    if (normalizeLabel(normalizedCurrent) === normalizeLabel(normalizedNext)) {
      return false;
    }

    const allLabels = new Set([
      ...categories.map((node) => normalizeLabel(node.label)),
      ...customCategoryLabels.map((node) => normalizeLabel(node)),
    ]);

    if (allLabels.has(normalizeLabel(normalizedNext))) {
      toast.error("Category already exists.");
      return false;
    }

    const categoryNode = categories.find(
      (node) => normalizeLabel(node.label) === normalizeLabel(normalizedCurrent),
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
          normalizeLabel(label) === normalizeLabel(normalizedCurrent) ? normalizedNext : label,
        ),
      );
      setOrderedCategoryLabels((current) =>
        current.map((label) =>
          normalizeLabel(label) === normalizeLabel(normalizedCurrent) ? normalizedNext : label,
        ),
      );

      if (previousSelectedSourceUrl) {
        if (!refreshedCategories) {
          refreshedCategories = await loadFeedSources();
        }

        const selectedNode = flattenCategoryFeeds(refreshedCategories).find(
          (node) => node.data?.url === previousSelectedSourceUrl,
        );

        if (selectedNode) {
          setSelectedCategory(selectedNode.key);
        }
      }

      toast.success("Category updated.");
      return true;
    } catch (err) {
      console.error("Rename category error:", err);
      toast.error("Unable to rename category.");
      return false;
    }
  };

  const moveCategoryByDrop = async (label: string, targetIndex: number) => {
    setOrderedCategoryLabels((current) => {
      const currentIndex = current.findIndex(
        (currentLabel) => normalizeLabel(currentLabel) === normalizeLabel(label),
      );

      if (currentIndex < 0) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(currentIndex, 1);
      const safeTargetIndex = Math.max(0, Math.min(targetIndex, next.length));
      const insertionIndex = currentIndex < safeTargetIndex ? safeTargetIndex - 1 : safeTargetIndex;
      next.splice(insertionIndex, 0, moved);
      return next;
    });
  };

  const removeCategory = async (label: string) => {
    const categoryNode = categories.find(
      (node) => normalizeLabel(node.label) === normalizeLabel(label),
    );
    const feedsInCategory = categoryNode?.children ?? [];
    const feedCount = feedsInCategory.length;

    if (feedCount > 0) {
      if (normalizeLabel(pendingCategoryRemovalLabel ?? "") !== normalizeLabel(label)) {
        setPendingCategoryRemovalLabel(label);
        return false;
      }

      const targetCategory = [
        ...categories.map((categoryNode) => categoryNode.label),
        ...customCategoryLabels,
      ]
        .map((categoryLabel) => canonicalizeCategoryLabel(categoryLabel))
        .find((categoryLabel) => normalizeLabel(categoryLabel) !== normalizeLabel(label));

      if (!targetCategory) {
        setPendingCategoryRemovalLabel(null);
        toast.error("Add another category before removing this one.");
        return false;
      }

      ensureCategoryLabelExists(targetCategory);

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

          if (selectedNode) {
            setSelectedCategory(selectedNode.key);
          }
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
    setCustomCategoryLabels((current) =>
      current.filter((currentLabel) => normalizeLabel(currentLabel) !== normalizeLabel(label)),
    );
    setOrderedCategoryLabels((current) =>
      current.filter((currentLabel) => normalizeLabel(currentLabel) !== normalizeLabel(label)),
    );
    toast.success("Category removed.");
    return true;
  };

  const fetchFeedBatch = async (sources: FeedBatchSource[]) => {
    const requestId = latestFeedRequestIdRef.current + 1;
    latestFeedRequestIdRef.current = requestId;
    const normalizedSources = Array.from(
      sources
        .filter((source) => source.url)
        .reduce((accumulator, source) => {
          if (!accumulator.has(source.url)) {
            accumulator.set(source.url, source);
          }

          return accumulator;
        }, new Map<string, FeedBatchSource>())
        .values(),
    );

    setLoading(true);
    setFeed([]);

    try {
      if (normalizedSources.length === 0) {
        setExpandedArticleKey(null);
        return;
      }

      const sourceNameByUrl = new Map(
        normalizedSources.map((source) => [source.url, source.name] as const),
      );

      let batchResults: Array<{ url: string; articles: Article[]; ok: boolean }>;

      try {
        batchResults = await FeedService.getFeedsBatch(
          normalizedSources.map((source) => source.url),
        );
      } catch (error) {
        if (usePlaceholderData) {
          const fallbackArticles = dedupeAndSortArticles(
            normalizedSources.flatMap((source) =>
              getDevPlaceholderArticlesForSource(source.url).map((article) => ({
                ...article,
                feedName: source.name,
                feedUrl: source.url,
              })),
            ),
          );

          setFeed(fallbackArticles);
          setExpandedArticleKey(null);
          return;
        }

        console.error("Batch feed fetch error:", error);
        toast.error("Unable to load this feed right now.", {
          description: "Please try refreshing the selected source again.",
        });
        return;
      }

      const results: Array<Article[] | null> = batchResults.map((result) => {
        const sourceName = sourceNameByUrl.get(result.url);

        if (result.ok && result.articles.length > 0) {
          return result.articles.map((article: Article) => ({
            ...article,
            feedName: sourceName,
            feedUrl: result.url,
          }));
        }

        if (usePlaceholderData) {
          return getDevPlaceholderArticlesForSource(result.url).map((article) => ({
            ...article,
            feedName: sourceName,
            feedUrl: result.url,
          }));
        }

        return null;
      });

      if (latestFeedRequestIdRef.current !== requestId) {
        return;
      }

      const mergedArticles = dedupeAndSortArticles(
        results
          .filter((result: Article[] | null): result is Article[] => Array.isArray(result))
          .flat(),
      );

      if (mergedArticles.length > 0) {
        setFeed(mergedArticles);
        setExpandedArticleKey(null);
        return;
      }

      const hasConfiguredFeeds = flattenCategoryFeeds(categories).length > 0;
      if (!hasConfiguredFeeds) {
        toast.info("No feed sources yet.", {
          description: "Add your feeds in Settings to start reading.",
        });
        return;
      }

      toast.error("Unable to load this feed right now.", {
        description: "Please try refreshing the selected source again.",
      });
    } finally {
      if (latestFeedRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const fetchFeed = async (url: string = DEFAULT_FEED_URL) => {
    const sourceName = flattenCategoryFeeds(categories).find((node) => node.data?.url === url)?.label;
    await fetchFeedBatch([{ url, name: sourceName }]);
  };

  const fetchCategoryFeeds = async (categoryNode: CategoryTreeNode) => {
    const sources: FeedBatchSource[] = [];
    (categoryNode.children ?? []).forEach((node: CategoryTreeNode) => {
      if (node.data?.url) {
        sources.push({ url: node.data.url, name: node.label });
      }
    });

    await fetchFeedBatch(sources);
  };

  const fetchAllFeeds = async (sourceCategories: CategoryTreeNode[] = categories) => {
    const sources: FeedBatchSource[] = [];
    flattenCategoryFeeds(sourceCategories).forEach((node: CategoryTreeNode) => {
      if (node.data?.url) {
        sources.push({ url: node.data.url, name: node.label });
      }
    });

    await fetchFeedBatch(sources);
  };

  const handleFeedClick = (feedNode: CategoryTreeNode) => {
    setSelectedCategory(feedNode.key);
    if (feedNode.data?.url) {
      fetchFeed(feedNode.data.url);
    }
  };

  const handleCategoryClick = (categoryNode: CategoryTreeNode) => {
    setSelectedCategory(categoryNode.key);

    if (categoryNode.key === ALL_FEEDS_NODE_KEY) {
      fetchAllFeeds();
      return;
    }

    fetchCategoryFeeds(categoryNode);
  };

  const hydrateArticleContent = async (article: Article) => {
    const link = article.link?.trim();

    if (!link || !isValidUrl(link)) {
      return;
    }

    if (
      hydratedArticleLinksRef.current.has(link) ||
      articleHydrationInFlightRef.current.has(link)
    ) {
      return;
    }

    articleHydrationInFlightRef.current.add(link);
    setHydratingArticleLinks((current) => ({
      ...current,
      [link]: true,
    }));

    try {
      const extractedContent = await ArticleService.extractArticleContent(link);

      if (!extractedContent) {
        hydratedArticleLinksRef.current.add(link);
        return;
      }

      setFeed((currentFeed) =>
        currentFeed.map((currentArticle) => {
          if (currentArticle.link.trim() !== link) {
            return currentArticle;
          }

          if ((extractedContent.length ?? 0) <= (currentArticle.content?.length ?? 0)) {
            return currentArticle;
          }

          return {
            ...currentArticle,
            content: extractedContent,
          };
        }),
      );

      hydratedArticleLinksRef.current.add(link);
      setHydratedArticleLinks((current) => ({
        ...current,
        [link]: true,
      }));
    } catch (error) {
      console.error("Article hydration error:", error);
    } finally {
      articleHydrationInFlightRef.current.delete(link);
      setHydratingArticleLinks((current) => {
        if (!current[link]) {
          return current;
        }

        const { [link]: _, ...rest } = current;
        return rest;
      });
    }
  };

  const handleArticleToggle = async (article: Article) => {
    const nextArticleKey = getArticleKey(article);
    const shouldExpand = expandedArticleKey !== nextArticleKey;

    setExpandedArticleKey((current) => (current === nextArticleKey ? null : nextArticleKey));

    if (!shouldExpand) {
      return;
    }

    await hydrateArticleContent(article);
  };

  const filteredFeed = feed.filter(article =>
    article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (article.content || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Reset visible window whenever the underlying feed or search changes.
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [feed, searchTerm, pageSize]);

  // Infinite scroll: load next page when sentinel enters viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + pageSize, filteredFeed.length));
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredFeed.length, pageSize]);

  useEffect(() => {
    const initializeDashboard = async () => {
      const loadedCategories = await loadFeedSources();
      setSelectedCategory(ALL_FEEDS_NODE_KEY);
      await fetchAllFeeds(loadedCategories);
    };

    initializeDashboard();
  }, []);

  useEffect(() => {
    const uniqueLabels = [
      ...categories.map((node) => node.label),
      ...customCategoryLabels.filter(
        (label) =>
          !categories.some((existing) => normalizeLabel(existing.label) === normalizeLabel(label)),
      ),
    ].filter((label, index, allLabels) => {
      return (
        allLabels.findIndex((candidate) => normalizeLabel(candidate) === normalizeLabel(label)) === index
      );
    });

    setOrderedCategoryLabels((current) => {
      const preserved = current.filter((label) =>
        uniqueLabels.some((candidate) => normalizeLabel(candidate) === normalizeLabel(label)),
      );
      const additions = uniqueLabels.filter(
        (label) => !preserved.some((candidate) => normalizeLabel(candidate) === normalizeLabel(label)),
      );

      return [...preserved, ...additions];
    });
  }, [categories, customCategoryLabels]);

  const availableSources = flattenCategoryFeeds(categories);
  const selectedFeedNode = availableSources.find((c) => c.key === selectedCategory);
  const categoryMap = new Map<string, CategoryTreeNode>();
  categories.forEach((categoryNode) => {
    categoryMap.set(normalizeLabel(categoryNode.label), categoryNode);
  });
  customCategoryLabels
    .filter(
      (label) => !categories.some((existing) => normalizeLabel(existing.label) === normalizeLabel(label)),
    )
    .forEach((label) => {
      categoryMap.set(normalizeLabel(label), {
        key: toCategoryKey(label),
        label,
        children: [] as CategoryTreeNode[],
      });
    });

  const orderedLabels =
    orderedCategoryLabels.length > 0
      ? orderedCategoryLabels
      : [...categoryMap.values()].map((categoryNode) => categoryNode.label);

  const displayCategories = orderedLabels
    .map((label) => categoryMap.get(normalizeLabel(label)))
    .filter((categoryNode): categoryNode is CategoryTreeNode => Boolean(categoryNode));
  const sidebarCategories = [SYSTEM_ALL_FEEDS_CATEGORY, ...displayCategories];
  const selectedCategoryNode = sidebarCategories.find((categoryNode) => categoryNode.key === selectedCategory);
  const selectedFeedUrl = selectedFeedNode?.data?.url;
  const selectedFeed = selectedFeedNode?.label ?? selectedCategoryNode?.label;
  const categoryOptions = displayCategories.map((categoryNode) => categoryNode.label);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dashboard:title-change", {
        detail: { title: selectedFeed ?? "LibreRSS" },
      }),
    );
  }, [selectedFeed]);

  useEffect(() => {
    const handleRefresh = () => {
      if (selectedCategory === ALL_FEEDS_NODE_KEY) {
        fetchAllFeeds();
        return;
      }

      if (selectedFeedUrl) {
        fetchFeed(selectedFeedUrl);
        return;
      }

      if (selectedCategoryNode) {
        fetchCategoryFeeds(selectedCategoryNode);
        return;
      }

      fetchFeed(DEFAULT_FEED_URL);
    };

    const handleOpenSettings = () => {
      setShowSettingsModal(true);
    };

    const handleSearchChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ term?: string }>;
      setSearchTerm(customEvent.detail?.term ?? "");
    };

    window.addEventListener("dashboard:refresh", handleRefresh);
    window.addEventListener("dashboard:open-settings", handleOpenSettings);
    window.addEventListener("dashboard:search-change", handleSearchChange as EventListener);

    return () => {
      window.removeEventListener("dashboard:refresh", handleRefresh);
      window.removeEventListener("dashboard:open-settings", handleOpenSettings);
      window.removeEventListener("dashboard:search-change", handleSearchChange as EventListener);
    };
  }, [selectedCategory, selectedCategoryNode, selectedFeedUrl]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("dashboard:search-sync", { detail: { term: searchTerm } }));
  }, [searchTerm]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsSidebarVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <motion.div
      className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4 pb-6 pt-20 md:px-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >

      {/* Main layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:items-stretch">
        {/* Sidebar */}
        <aside className="min-h-0 overflow-hidden lg:w-[220px] lg:shrink-0">
          <ScrollArea
            className={`h-full transition-opacity duration-300 ease-out ${isSidebarVisible ? "opacity-100" : "opacity-0"
              }`}
          >
            <div className="space-y-4 pr-3">
              {sidebarCategories.length === 0 ? (
                <div className="px-2 py-8 text-xs text-muted-foreground/70">No feed sources yet.</div>
              ) : (
                sidebarCategories.map((categoryNode: CategoryTreeNode, index) => (
                  <div
                    key={categoryNode.key}
                    className={`space-y-1 transition-opacity duration-300 ease-out ${isSidebarVisible ? "opacity-100" : "opacity-0"
                      }`}
                    style={{ transitionDelay: `${index * 35}ms` }}
                  >
                    <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                      <button
                        type="button"
                        className={`w-full rounded px-1 py-1 text-left text-[11px] font-medium uppercase tracking-wide transition-colors ${selectedCategory === categoryNode.key
                          ? "bg-muted/60 text-foreground"
                          : "text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground"
                          }`}
                        onClick={() => handleCategoryClick(categoryNode)}
                      >
                        {categoryNode.label}
                      </button>
                    </div>
                    {(categoryNode.children ?? []).map((feedNode: CategoryTreeNode) => (
                      <FeedCategory
                        key={feedNode.key}
                        category={feedNode}
                        isActive={selectedCategory === feedNode.key}
                        showFavicon={showFavicons}
                        onClick={() => handleFeedClick(feedNode)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        <Separator orientation="vertical" className="hidden lg:block" />

        {/* Feed area */}
        <motion.section
          className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-w-0"
          initial={panelMotion.initial}
          animate={panelMotion.animate}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 }}
        >

          <ScrollArea className="min-h-0 flex-1">
            {loading ? (
              <div className="grid grid-cols-1 gap-2 pr-3 py-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="rounded-xl border bg-card/40 p-3">
                    <div className="h-3 w-1/3 rounded bg-muted/60" />
                    <div className="mt-2 h-4 w-5/6 rounded bg-muted/70" />
                    <div className="mt-3 space-y-2">
                      <div className="h-3 w-full rounded bg-muted/50" />
                      <div className="h-3 w-4/5 rounded bg-muted/50" />
                      <div className="h-3 w-2/3 rounded bg-muted/50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredFeed.length === 0 ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? "No matches." : "No articles yet."}
                  </p>
                  {searchTerm ? (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="text-xs text-muted-foreground/60 underline underline-offset-2"
                    >
                      Clear search
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (selectedCategory === ALL_FEEDS_NODE_KEY) {
                          fetchAllFeeds();
                          return;
                        }

                        fetchFeed(selectedFeedUrl ?? DEFAULT_FEED_URL);
                      }}
                      className="text-xs text-muted-foreground/60 underline underline-offset-2"
                    >
                      Refresh
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 pr-3">
                {filteredFeed.slice(0, visibleCount).map((article) => {
                  const cardKey = getArticleKey(article);
                  return (
                    <ArticleCard
                      key={cardKey}
                      article={article}
                      isExpanded={expandedArticleKey === cardKey}
                      useRichFormatting={Boolean(hydratedArticleLinks[cardKey])}
                      isHydrating={Boolean(hydratingArticleLinks[cardKey])}
                      showFavicon={showFavicons}
                      onToggle={() => void handleArticleToggle(article)}
                    />
                  );
                })}
                {/* Sentinel: triggers next page load when scrolled into view */}
                <div ref={sentinelRef} className="py-1 flex justify-center">
                  {visibleCount < filteredFeed.length && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </motion.section>
      </div>

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          categories={displayCategories}
          categoryOptions={categoryOptions}
          pendingCategoryRemovalLabel={pendingCategoryRemovalLabel}
          selectedCategory={selectedCategory}
          pageSize={pageSize}
          showFavicons={showFavicons}
          onPageSizeChange={(size) => {
            setPageSize(size);
            localStorage.setItem("librerss:pageSize", String(size));
          }}
          onShowFaviconsChange={(value) => {
            setShowFavicons(value);
            localStorage.setItem("librerss:showFavicons", String(value));
          }}
          onImportOpml={importOpmlFeeds}
          onSelectFeed={selectFeedByKey}
          onDropFeed={moveFeedByDrop}
          onAddFeed={addFeedSource}
          onAddCategory={addCategory}
          onRenameCategory={renameCategory}
          onDropCategory={moveCategoryByDrop}
          onRemoveCategory={removeCategory}
          onRemoveFeed={removeFeedSource}
          onRenameFeed={renameFeedSource}
        />
      )}
    </motion.div>
  );
};

function DashboardRouter() {
  const searchParams = useSearchParams();
  const view = searchParams?.get("view") || "dashboard";
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [allowSignup, setAllowSignup] = useState(true);
  const [usePlaceholderData, setUsePlaceholderData] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await AuthService.getSession();
        setAllowSignup(session.allowSignup);
        setUsePlaceholderData(session.usePlaceholderData);
        setCurrentUser(session.authenticated ? session.user : null);
      } catch {
        setAllowSignup(true);
        setCurrentUser(null);
      } finally {
        setIsSessionLoading(false);
      }
    };

    loadSession();
  }, []);

  const handleEnterPreview = () => {
    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent("dashboard:enter-preview"));
  };

  if (isSessionLoading) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
        </div>
      </main>
    );
  }

  if (!currentUser && !isPreviewMode) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <LoginView
          onAuthenticated={setCurrentUser}
          allowSignup={allowSignup}
          onEnterPreview={!allowSignup ? handleEnterPreview : undefined}
        />
      </main>
    );
  }

  return (
    <main className="h-full overflow-hidden bg-background">
      {view === "settings" ? (
        <SettingsView />
      ) : (
        <DashboardView usePlaceholderData={isPreviewMode || usePlaceholderData} />
      )}
    </main>
  );
}

export default function Dashboard() {
  return (
    <>
      {ENV.isDevelopment && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <div className="h-[100dvh] overflow-hidden">
        <Suspense
          fallback={
            <motion.div
              className="flex h-full items-center justify-center overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="size-4 text-muted-foreground/40" />
              </motion.div>
            </motion.div>
          }
        >
          <DashboardRouter />
        </Suspense>
      </div>
    </>
  );
}
