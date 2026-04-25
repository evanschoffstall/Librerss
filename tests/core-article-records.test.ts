import { describe, expect, test } from "bun:test";

import { withNormalizedArticleContent } from "@/lib/core";

describe("core/article-records", () => {
  test("withNormalizedArticleContent returns the original article when content is null", () => {
    const article = {
      content: null,
      feedId: 1,
      id: 42,
      lastChecked: new Date("2026-01-01T00:00:00.000Z"),
      link: "https://example.com/articles/42",
      publicationDate: new Date("2026-01-01T00:00:00.000Z"),
      title: "Untouched article",
    };

    expect(withNormalizedArticleContent(article)).toBe(article);
  });
});
