/**
 * Pure utility functions for the dashboard.
 *
 * Stateless helpers extracted from `page.tsx` so the component file
 * contains only React state, effects, and rendering.
 */

import {
  normalizeCategory,
  normalizeCategoryLabelKey,
  type Article,
  type CategoryTreeNode,
} from "@/lib";
import {
  PLACEHOLDER_CATEGORY,
  PLACEHOLDER_FEED_SOURCES,
} from "@/lib/core/placeholder";
import {
  ALL_FEEDS_LABEL,
  ALL_FEEDS_NODE_KEY,
  INITIAL_CATEGORIES,
} from "./constants";

// ─── Category key generation ─────────────────────────────────────────────────

export const toCategoryKey = (label: string) =>
  `cat-${
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  }`;

/** Alias for normalized category-label comparison. */
export const normalizeLabel = normalizeCategoryLabelKey;

// ─── Category tree construction ──────────────────────────────────────────────

export const flattenCategoryFeeds = (nodes: CategoryTreeNode[]) =>
  nodes.flatMap((category) => category.children ?? []);

export const buildCategoriesFromSources = (
  sources: Array<{
    id: number;
    name: string;
    url: string;
    category?: string | null;
  }>,
): CategoryTreeNode[] => {
  const grouped = new Map<string, CategoryTreeNode[]>();

  for (const source of sources) {
    const categoryLabel = normalizeCategory(source.category);
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

export const buildDefaultCategories = (
  usePlaceholderData: boolean,
): CategoryTreeNode[] => {
  if (!usePlaceholderData) {
    return INITIAL_CATEGORIES;
  }

  return [
    {
      key: toCategoryKey(PLACEHOLDER_CATEGORY),
      label: PLACEHOLDER_CATEGORY,
      children: PLACEHOLDER_FEED_SOURCES.map((source, index) => ({
        key: `${toCategoryKey(PLACEHOLDER_CATEGORY)}-dev-${index}`,
        label: source.name,
        data: { url: source.url, category: source.category },
      })),
    },
  ];
};

// ─── All-feeds sentinel node ─────────────────────────────────────────────────

export const SYSTEM_ALL_FEEDS_CATEGORY: CategoryTreeNode = {
  key: ALL_FEEDS_NODE_KEY,
  label: ALL_FEEDS_LABEL,
  data: { url: "" },
  children: [],
};

// ─── Article dedup & sorting ─────────────────────────────────────────────────

export const dedupeAndSortArticles = (articles: Article[]) => {
  const uniqueArticles = new Map<string, Article>();

  for (const article of articles) {
    if (!article.link?.trim()) continue;

    const key = article.link.trim();
    const existing = uniqueArticles.get(key);

    if (!existing) {
      uniqueArticles.set(key, article);
      continue;
    }

    const shouldReplace =
      (article.content?.length ?? 0) > (existing.content?.length ?? 0) ||
      (article.content?.length === existing.content?.length &&
        new Date(article.publicationDate).getTime() >
          new Date(existing.publicationDate).getTime());

    if (shouldReplace) {
      uniqueArticles.set(key, article);
    }
  }

  return [...uniqueArticles.values()].sort(
    (a, b) =>
      new Date(b.publicationDate).getTime() -
      new Date(a.publicationDate).getTime(),
  );
};

export const getArticleKey = (article: Article) => article.link.trim();

// ─── Motion presets ──────────────────────────────────────────────────────────

export const panelMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeedBatchSource {
  url: string;
  name: string | undefined;
}

// ─── Batch result mapping ────────────────────────────────────────────────────

interface BatchResultItem {
  url: string;
  articles: Article[];
  ok: boolean;
}

/**
 * Maps raw batch-fetch results into a flat, deduplicated, sorted article list.
 *
 * For successful responses, enriches each article with `feedName` / `feedUrl`.
 * Falls back to placeholder data when `usePlaceholderData` is true.
 */
export function mapBatchResultsToArticles(
  batchResults: BatchResultItem[],
  sourceNameByUrl: Map<string, string | undefined>,
  usePlaceholderData: boolean,
  getPlaceholderArticles: (url: string) => Article[],
): Article[] {
  const perFeedArticles = batchResults.map((result): Article[] | null => {
    const sourceName = sourceNameByUrl.get(result.url);

    if (result.ok && result.articles.length > 0) {
      return result.articles.map((article) => ({
        ...article,
        feedName: sourceName,
        feedUrl: result.url,
      }));
    }

    if (usePlaceholderData) {
      return getPlaceholderArticles(result.url).map((article) => ({
        ...article,
        feedName: sourceName,
        feedUrl: result.url,
      }));
    }

    return null;
  });

  return dedupeAndSortArticles(
    perFeedArticles
      .filter((result): result is Article[] => Array.isArray(result))
      .flat(),
  );
}

// ─── Category tree mutation (pure) ───────────────────────────────────────────

/**
 * Returns a new category array with a feed node moved between categories.
 *
 * Used by the drag-and-drop handler. Pure function so the state setter
 * in the component only needs: `setCategories(prev => relocateFeed(prev, …))`.
 */
export function relocateFeedInCategories(
  currentCategories: CategoryTreeNode[],
  feedKey: string,
  targetCategoryLabel: string,
  targetIndex: number,
): CategoryTreeNode[] {
  const sourceCategoryIndex = currentCategories.findIndex((cat) =>
    (cat.children ?? []).some((node) => node.key === feedKey),
  );

  if (sourceCategoryIndex < 0) return currentCategories;

  const nextCategories = currentCategories.map((cat) => ({
    ...cat,
    children: [...(cat.children ?? [])],
  }));

  let destinationCategoryIndex = nextCategories.findIndex(
    (cat) => normalizeLabel(cat.label) === normalizeLabel(targetCategoryLabel),
  );

  if (destinationCategoryIndex < 0) {
    nextCategories.push({
      key: toCategoryKey(targetCategoryLabel),
      label: targetCategoryLabel,
      children: [],
    });
    destinationCategoryIndex = nextCategories.length - 1;
  }

  const sourceFeeds = nextCategories[sourceCategoryIndex].children!;
  const sourceFeedIndex = sourceFeeds.findIndex((node) => node.key === feedKey);
  if (sourceFeedIndex < 0) return currentCategories;

  const [movedSource] = sourceFeeds.splice(sourceFeedIndex, 1);
  const destinationFeeds = nextCategories[destinationCategoryIndex].children!;

  const safeTargetIndex = Math.max(
    0,
    Math.min(targetIndex, destinationFeeds.length),
  );
  const insertionIndex =
    sourceCategoryIndex === destinationCategoryIndex &&
    sourceFeedIndex < safeTargetIndex
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
}
