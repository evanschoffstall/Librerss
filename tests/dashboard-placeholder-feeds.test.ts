import { describe, expect, test } from "bun:test";

import { buildDefaultCategories } from "@/app/dashboard/dashboard-services/category-tree";
import {
  getPlaceholderArticlesForSource,
  getPlaceholderSnapshotPathByArticleUrl,
  PLACEHOLDER_FEED_SOURCES,
} from "@/lib/core/placeholder";
import { PLACEHOLDER_ARTICLE_COUNT } from "@/lib/core/placeholder-sources";

describe("placeholder feed wiring", () => {
  test("marks placeholder sources as extraction disabled", () => {
    expect(PLACEHOLDER_FEED_SOURCES).toHaveLength(17);
    expect(
      PLACEHOLDER_FEED_SOURCES.every((source) => source.extractionDisabled),
    ).toBe(true);
    const feedNames = PLACEHOLDER_FEED_SOURCES.map((source) => source.name);

    expect(feedNames).toEqual(
      expect.arrayContaining([
        "ESA Earth Observation",
        "ESA Human Exploration",
        "ESA Top News",
        "NASA Breaking News",
        "NASA STEM Learning",
        "NHLBI All News",
        "NINDS Press Releases",
        "NIH News Releases",
        "NIH Research Matters",
      ]),
    );
    expect(feedNames).not.toContain("ESA Images");
    expect(feedNames).not.toContain("NASA Image of the Day");
  });

  test("preserves extraction settings in preview category nodes", () => {
    const categories = buildDefaultCategories(true);
    const feeds = categories[0]?.children ?? [];

    expect(feeds).toHaveLength(PLACEHOLDER_FEED_SOURCES.length);
    expect(feeds.map((feed) => feed.data?.extractionDisabled)).toEqual(
      PLACEHOLDER_FEED_SOURCES.map((source) => source.extractionDisabled),
    );
  });

  test("maps every placeholder article URL to a local snapshot", () => {
    let totalArticles = 0;
    const uniqueUrls = new Set<string>();

    for (const source of PLACEHOLDER_FEED_SOURCES) {
      const articles = getPlaceholderArticlesForSource(source.url);
      expect(articles.length).toBeGreaterThan(0);

      totalArticles += articles.length;

      for (const article of articles) {
        uniqueUrls.add(article.link);
        expect(getPlaceholderSnapshotPathByArticleUrl(article.link)).toMatch(
          /^\/placeholder-articles\//,
        );
      }
    }

    expect(totalArticles).toBe(PLACEHOLDER_ARTICLE_COUNT);
    expect(uniqueUrls.size).toBe(totalArticles);
  });
});
