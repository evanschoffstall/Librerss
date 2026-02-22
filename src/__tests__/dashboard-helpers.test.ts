import { describe, expect, test } from "bun:test";

import {
  dedupeAndSortArticles,
  relocateFeedInCategories,
  toCategoryKey,
} from "@/app/dashboard/helpers";
import type { Article, CategoryTreeNode } from "@/lib";

function article(overrides: Partial<Article>): Article {
  return {
    id: 1,
    title: "Article",
    link: "https://example.com/post",
    content: "short",
    publicationDate: new Date("2026-01-01T00:00:00.000Z"),
    lastChecked: new Date("2026-01-01T00:00:00.000Z"),
    feedId: 10,
    ...overrides,
  };
}

describe("dedupeAndSortArticles", () => {
  test("keeps the richest duplicate by link", () => {
    const olderShort = article({
      id: 1,
      link: "https://example.com/a",
      content: "short",
      publicationDate: new Date("2026-01-01T00:00:00.000Z"),
    });

    const newerLong = article({
      id: 2,
      link: "https://example.com/a",
      content: "much longer content",
      publicationDate: new Date("2026-01-02T00:00:00.000Z"),
    });

    const result = dedupeAndSortArticles([olderShort, newerLong]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test("sorts by publication date descending", () => {
    const oldest = article({
      id: 1,
      link: "https://example.com/old",
      publicationDate: new Date("2026-01-01T00:00:00.000Z"),
    });

    const newest = article({
      id: 2,
      link: "https://example.com/new",
      publicationDate: new Date("2026-01-03T00:00:00.000Z"),
    });

    const middle = article({
      id: 3,
      link: "https://example.com/mid",
      publicationDate: new Date("2026-01-02T00:00:00.000Z"),
    });

    const result = dedupeAndSortArticles([oldest, newest, middle]);

    expect(result.map((entry) => entry.id)).toEqual([2, 3, 1]);
  });
});

describe("relocateFeedInCategories", () => {
  test("moves a feed to another category and updates category metadata", () => {
    const sourceCategoryKey = toCategoryKey("Tech");
    const destinationCategoryKey = toCategoryKey("News");

    const categories: CategoryTreeNode[] = [
      {
        key: sourceCategoryKey,
        label: "Tech",
        children: [
          {
            key: `${sourceCategoryKey}-1`,
            label: "Feed One",
            data: {
              url: "https://example.com/one.xml",
              sourceId: 1,
              category: "Tech",
            },
          },
        ],
      },
      {
        key: destinationCategoryKey,
        label: "News",
        children: [],
      },
    ];

    const result = relocateFeedInCategories(
      categories,
      `${sourceCategoryKey}-1`,
      "News",
      0,
    );

    expect(result[0].children).toHaveLength(0);
    expect(result[1].children).toHaveLength(1);
    expect(result[1].children?.[0].data?.category).toBe("News");
  });
});
