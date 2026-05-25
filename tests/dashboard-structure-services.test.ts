import { describe, expect, test } from "bun:test";

import type { Article, CategoryTreeNode } from "@/lib/core";

import { filterArticlesByState } from "@/app/dashboard/services/article";
import {
  buildDisplayCategories,
  computeNextOrderedCategoryLabels,
} from "@/app/dashboard/services/category";
import {
  buildCategoriesFromSources,
  buildDefaultCategories,
  findFeedNodeByKey,
  findFeedNodeByUrl,
  getAllFeedNodes,
  getFeedUrlBySelectedKey,
  getFirstFeedNode,
  hasCategoryLabelInTree,
  relocateFeedInCategories,
  SYSTEM_ALL_FEEDS_CATEGORY,
  toDistinctCategoryLabels,
} from "@/app/dashboard/services/category-tree";
import { buildDashboardViewModel } from "@/app/dashboard/services/dashboard-state";

describe("dashboard structure services", () => {
  test("buildDisplayCategories appends missing custom labels and respects explicit ordering", () => {
    const categories = [createCategory("News"), createCategory("Science")];

    const result = buildDisplayCategories(
      categories,
      ["Design"],
      ["Design", "science", "news"],
    );

    expect(result.map((category) => category.label)).toEqual([
      "Design",
      "Science",
      "News",
    ]);
  });

  test("computeNextOrderedCategoryLabels preserves existing order and appends new distinct labels", () => {
    const categories = [createCategory("News"), createCategory("Science")];

    expect(
      computeNextOrderedCategoryLabels(
        categories,
        ["Design", "science", "News"],
        ["science", "Missing", "Design"],
      ),
    ).toEqual(["science", "Design", "News"]);
  });

  test("category-tree helpers build normalized source trees and support lookup utilities", () => {
    const categories = buildCategoriesFromSources([
      {
        category: " News ",
        enabled: true,
        extractionDisabled: true,
        id: 1,
        name: "Feed One",
        proxyEnabled: true,
        url: "https://example.com/one.xml",
      },
      {
        category: "science",
        enabled: false,
        id: 2,
        name: "Feed Two",
        url: "https://example.com/two.xml",
      },
    ]);

    expect(categories.map((category) => category.label)).toEqual([
      "News",
      "science",
    ]);
    expect(getAllFeedNodes(categories)).toHaveLength(2);
    expect(findFeedNodeByKey(categories, "cat-news-1")?.label).toBe("Feed One");
    expect(
      findFeedNodeByUrl(categories, "https://example.com/two.xml")?.key,
    ).toBe("cat-science-2");
    expect(getFeedUrlBySelectedKey(categories, "cat-news-1")).toBe(
      "https://example.com/one.xml",
    );
    expect(getFirstFeedNode(categories)?.key).toBe("cat-news-1");
    expect(hasCategoryLabelInTree(categories, " science ")).toBe(true);
  });

  test("buildDefaultCategories returns placeholder feeds only in preview mode", () => {
    expect(buildDefaultCategories(false)).toHaveLength(1);

    const previewCategories = buildDefaultCategories(true);
    const previewCategory = previewCategories[0];
    expect(previewCategories).toHaveLength(1);
    expect(previewCategory).toBeDefined();
    expect(previewCategory?.children?.length ?? 0).toBeGreaterThan(0);
  });

  test("relocateFeedInCategories moves feeds within and across categories", () => {
    const categories = [
      createCategory("News", [
        createFeed("feed-1", "News"),
        createFeed("feed-2", "News"),
      ]),
      createCategory("Science", [createFeed("feed-3", "Science")]),
    ];

    const reordered = relocateFeedInCategories(categories, "feed-1", "News", 2);
    expect(reordered[0].children?.map((feed) => feed.key)).toEqual([
      "feed-2",
      "feed-1",
    ]);

    const moved = relocateFeedInCategories(categories, "feed-2", "Design", 0);
    expect(moved.at(-1)?.label).toBe("Design");
    expect(moved.at(-1)?.children?.[0].data?.category).toBe("Design");
    expect(
      toDistinctCategoryLabels(["News", "news", "Science", "Science"]),
    ).toEqual(["News", "Science"]);
  });

  test("filterArticlesByState applies read, starred, and unread expansion rules", () => {
    const articles = [
      createArticle({ id: 1, isRead: false, isStarred: false }),
      createArticle({ id: 2, isRead: true, isStarred: false }),
      createArticle({ id: 3, isRead: true, isStarred: true }),
    ];

    expect(filterArticlesByState(articles, "all", null, [])).toEqual(articles);
    expect(filterArticlesByState(articles, "read", null, [])).toEqual([
      articles[1],
      articles[2],
    ]);
    expect(filterArticlesByState(articles, "starred", null, [])).toEqual([
      articles[2],
    ]);
    expect(
      filterArticlesByState(articles, "unread", articles[1].link, [
        articles[2].link,
      ]),
    ).toEqual([articles[0], articles[1], articles[2]]);
  });

  test("buildDashboardViewModel filters disabled sidebar feeds while preserving the all-feeds sentinel", () => {
    const categories = [
      createCategory("News", [
        createFeed("feed-1", "News", "https://example.com/one.xml"),
        createFeed("feed-2", "News", "https://example.com/two.xml", false),
      ]),
      createCategory("Science", [
        createFeed("feed-3", "Science", "https://example.com/three.xml"),
      ]),
    ];
    const unreadArticle = createArticle({
      id: 1,
      isRead: false,
      title: "Alpha launch",
    });
    const readArticle = createArticle({
      id: 2,
      isRead: true,
      title: "Beta mission",
    });

    const viewModel = buildDashboardViewModel({
      articleFilter: "unread",
      articleSortOrder: "newest",
      categories,
      collapsingArticleKeys: [],
      customCategoryLabels: ["Design"],
      expandedArticleKey: null,
      feed: [unreadArticle, readArticle],
      orderedCategoryLabels: ["Science", "Design", "News"],
      searchTerm: "alpha",
      selectedCategory: "feed-2",
      useLocalSearch: true,
      usePlaceholderData: false,
    });

    expect(viewModel.filteredFeed).toEqual([unreadArticle]);
    expect(
      viewModel.displayCategories.map((category) => category.label),
    ).toEqual(["Science", "Design", "News"]);
    expect(viewModel.sidebarCategories[0]).toEqual(SYSTEM_ALL_FEEDS_CATEGORY);
    expect(
      viewModel.sidebarCategories[1].children?.map((feed) => feed.key),
    ).toEqual(["feed-3"]);
    expect(viewModel.selectedFeedUrl).toBeUndefined();
    expect(viewModel.selectedFeed).toBe("Feed feed-2");
  });
});

function createArticle(
  overrides: Partial<Article> & Pick<Article, "id">,
): Article {
  const id = overrides.id;

  return {
    content: overrides.content ?? `Content ${id}`,
    feedId: overrides.feedId ?? 1,
    feedName: overrides.feedName,
    feedUrl: overrides.feedUrl,
    id,
    isRead: overrides.isRead ?? false,
    isStarred: overrides.isStarred ?? false,
    lastChecked: overrides.lastChecked ?? new Date("2024-01-01T00:00:00.000Z"),
    link: overrides.link ?? `https://example.com/article-${id}`,
    publicationDate:
      overrides.publicationDate ?? new Date("2024-01-01T00:00:00.000Z"),
    title: overrides.title ?? `Article ${id}`,
  };
}

function createCategory(
  label: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    children,
    key: `cat-${label.toLowerCase()}`,
    label,
  };
}

function createFeed(
  key: string,
  category: string,
  url = `https://example.com/${key}.xml`,
  enabled = true,
): CategoryTreeNode {
  return {
    children: [],
    data: {
      category,
      enabled,
      url,
    },
    key,
    label: `Feed ${key}`,
  };
}
