import { describe, expect, test } from "bun:test";

import {
  dedupeAndSortArticles,
  getArticleKey,
} from "@/app/dashboard/services/article-collection";
import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
} from "@/app/dashboard/services/article-content";
import { filterArticlesByState } from "@/app/dashboard/services/article-filters";
import { type Article } from "@/lib";

function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    content: "Body copy",
    feedId: 1,
    feedName: undefined,
    feedUrl: "https://feeds.example.com/rss.xml",
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date("2024-01-01T00:00:00.000Z"),
    link: "https://example.com/articles/1 ",
    publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    title: "Article title",
    ...overrides,
  };
}

describe("dashboard article helper coverage", () => {
  test("dedupeAndSortArticles trims keys, skips blank links, and keeps the richer duplicate", () => {
    const earlier = createArticle({
      content: "short",
      link: " https://example.com/articles/a ",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
      title: "Earlier",
    });
    const richerDuplicate = createArticle({
      content: "much longer article body",
      link: "https://example.com/articles/a",
      publicationDate: new Date("2024-01-02T00:00:00.000Z"),
      title: "Richer",
    });
    const newerEqualLength = createArticle({
      content: "same len",
      link: "https://example.com/articles/b",
      publicationDate: new Date("2024-01-03T00:00:00.000Z"),
      title: "Newer",
    });
    const olderEqualLength = createArticle({
      content: "same len",
      link: "https://example.com/articles/b",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
      title: "Older",
    });
    const blankLink = createArticle({ link: "   ", title: "Ignored" });

    const result = dedupeAndSortArticles([
      blankLink,
      olderEqualLength,
      earlier,
      richerDuplicate,
      newerEqualLength,
    ]);

    expect(result).toHaveLength(2);
    expect(getArticleKey(result[0])).toBe("https://example.com/articles/b");
    expect(result[0].title).toBe("Newer");
    expect(getArticleKey(result[1])).toBe("https://example.com/articles/a");
    expect(result[1].title).toBe("Richer");
  });

  test("filterArticlesByState preserves expanded and collapsing unread context", () => {
    const unread = createArticle({
      id: 10,
      isRead: false,
      link: "https://example.com/articles/unread",
      title: "Unread",
    });
    const readExpanded = createArticle({
      id: 11,
      isRead: true,
      link: "https://example.com/articles/expanded",
      title: "Expanded",
    });
    const readCollapsing = createArticle({
      id: 12,
      isRead: true,
      link: "https://example.com/articles/collapsing",
      title: "Collapsing",
    });
    const starred = createArticle({
      id: 13,
      isStarred: true,
      link: "https://example.com/articles/starred",
      title: "Starred",
    });
    const articles = [unread, readExpanded, readCollapsing, starred];

    expect(filterArticlesByState(articles, "all", null, [])).toEqual(articles);
    expect(filterArticlesByState(articles, "read", null, [])).toEqual([
      readExpanded,
      readCollapsing,
    ]);
    expect(filterArticlesByState(articles, "starred", null, [])).toEqual([
      starred,
    ]);
    expect(
      filterArticlesByState(articles, "unread", readExpanded.link.trim(), [
        readCollapsing.link.trim(),
      ]),
    ).toEqual([unread, readExpanded, readCollapsing, starred]);
  });

  test("article content helpers normalize previews and derive source labels", () => {
    expect(buildPreview("One\n\n\n two\t\tthree  ")).toEqual({
      hasOverflow: false,
      preview: "One two three",
    });

    expect(
      getArticleSourceLabel(
        createArticle({
          feedName: "  Feed Display Name  ",
          feedUrl: "https://feeds.example.com/custom.xml",
        }),
      ),
    ).toBe("  Feed Display Name  ");
    expect(
      getArticleSourceLabel(
        createArticle({
          feedName: "   ",
          feedUrl: "https://feeds.example.com/custom.xml",
        }),
      ),
    ).toBe("feeds.example.com");
    expect(
      getArticleSourceLabel(
        createArticle({
          feedName: undefined,
          feedUrl: undefined,
          link: "not a valid url",
        }),
      ),
    ).toBe("not a valid url");
  });

  test("getRichContentClass toggles the expanded typography contract", () => {
    const expanded = getRichContentClass(true);
    const collapsed = getRichContentClass(false);

    expect(expanded).toContain("text-[0.97rem]");
    expect(expanded).toContain("text-foreground/85");
    expect(expanded).toContain("[&_img]:min-h-[120px]");
    expect(collapsed).toContain("text-[0.91rem]");
    expect(collapsed).toContain("text-muted-foreground/85");
    expect(collapsed).toContain("[&_img]:min-h-[120px]");
  });
});