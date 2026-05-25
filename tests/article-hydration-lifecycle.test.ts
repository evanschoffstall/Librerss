import { describe, expect, mock, test } from "bun:test";

import type { ArticleHydrationState } from "@/app/dashboard/hooks/useArticleHydration.lifecycle";
import type { Article } from "@/lib/core";

import { prepareArticleHydration } from "@/app/dashboard/hooks/useArticleHydration.lifecycle";
import { PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources";

const getBundledPlaceholderArticle = () => {
  const definition = PLACEHOLDER_SOURCE_DEFINITIONS.find(
    (sourceDefinition) => sourceDefinition.seeds.length > 0,
  );
  const seed = definition?.seeds[0];

  if (!definition || !seed) {
    throw new Error("Expected at least one bundled placeholder article.");
  }

  return { feedUrl: definition.source.url, link: seed.url };
};

function buildArticle(overrides: Partial<Article> = {}): Article {
  return {
    content: "Feed-provided article body.",
    feedId: 1,
    feedName: "Example Feed",
    feedUrl: "https://example.com/feed.xml",
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date("2026-04-25T12:00:00.000Z"),
    link: "https://example.com/articles/hydration",
    publicationDate: new Date("2026-04-25T11:00:00.000Z"),
    title: "Hydration lifecycle article",
    ...overrides,
  };
}

function createHydrationState(): ArticleHydrationState {
  return {
    articleHydrationInFlightRef: { current: new Map<string, number>() },
    hydratedArticleLinks: {},
    hydratingArticleLinks: {},
    hydrationAbortRef: { current: new Map<string, AbortController>() },
    setHydratedArticleLinks: mock(() => {}),
    setHydratingArticleLinks: mock(() => {}),
  };
}

describe("prepareArticleHydration", () => {
  test("skips extraction-disabled feed articles that already have feed content", () => {
    const hydration = prepareArticleHydration({
      article: buildArticle(),
      forceHydration: false,
      getFeedSettings: () => ({ extractionDisabled: true }),
      hydrationState: createHydrationState(),
    });

    expect(hydration).toBeNull();
  });

  test("hydrates explore placeholder articles from local snapshots even when source extraction is disabled", () => {
    const bundledArticle = getBundledPlaceholderArticle();
    const hydration = prepareArticleHydration({
      article: buildArticle({
        content: "Feed excerpt that should be replaced by processed content.",
        feedUrl: bundledArticle.feedUrl,
        link: bundledArticle.link,
      }),
      forceHydration: false,
      getFeedSettings: () => ({ extractionDisabled: true }),
      hydrationState: createHydrationState(),
    });

    expect(hydration).toEqual({
      inFlightCount: 0,
      link: bundledArticle.link,
      settings: { extractionDisabled: true },
      shouldLoadStoredContent: false,
    });
  });

  test("allows extraction-enabled feed articles to enter hydration", () => {
    const hydration = prepareArticleHydration({
      article: buildArticle({ content: "Excerpt awaiting extraction." }),
      forceHydration: false,
      getFeedSettings: () => ({ extractionDisabled: false }),
      hydrationState: createHydrationState(),
    });

    expect(hydration).toEqual({
      inFlightCount: 0,
      link: "https://example.com/articles/hydration",
      settings: { extractionDisabled: false },
      shouldLoadStoredContent: false,
    });
  });
});
