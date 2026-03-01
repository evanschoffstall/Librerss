#!/usr/bin/env bun

import { useArticleHydration } from "@/app/dashboard/hooks/useArticleHydration";
import type { Article } from "@/lib";
import { ArticleService } from "@/lib";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("Article Hydration Fixtures", () => {
  const originalExtractArticleContent = ArticleService.extractArticleContent;
  const fixtureNames = [
    "test-pass-1",
    "test-pass-2",
    "test-fail-1",
    "test-fail-2",
  ] as const;

  const createMockArticle = (content: string): Article => ({
    id: 1,
    title: "Fixture Article",
    link: "https://example.com/article",
    content,
    publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    feedId: 1,
    feedName: "Fixture Feed",
    feedUrl: "https://example.com/feed.xml",
    isRead: false,
    isStarred: false,
    lastChecked: new Date("2024-01-01T00:00:00.000Z"),
  });

  const readFixture = (name: (typeof fixtureNames)[number]) =>
    readFileSync(
      join(
        process.cwd(),
        "src/__tests__/templates/expect-pipeline",
        `${name}.html`,
      ),
      "utf8",
    );

  afterEach(() => {
    ArticleService.extractArticleContent =
      originalExtractArticleContent as typeof ArticleService.extractArticleContent;
  });

  for (const fixtureName of fixtureNames) {
    test(`hydrates content from fixture ${fixtureName}`, async () => {
      const fixtureContent = readFixture(fixtureName);
      const extractedContent = `<p>Hydrated from ${fixtureName}</p>`;

      ArticleService.extractArticleContent = mock(
        async () => extractedContent,
      ) as unknown as typeof ArticleService.extractArticleContent;

      let feedState = [createMockArticle(fixtureContent)];
      const setFeed = mock((updater: any) => {
        feedState =
          typeof updater === "function" ? updater(feedState) : updater;
      });

      const { result } = renderHook(() => useArticleHydration({ setFeed }));

      await act(async () => {
        await result.current.hydrateArticleContent(feedState[0]);
      });

      await waitFor(() => {
        expect(ArticleService.extractArticleContent).toHaveBeenCalledWith(
          "https://example.com/article",
          expect.objectContaining({ useProxy: undefined }),
        );
        expect(feedState[0].content).toBe(extractedContent);
        expect(
          result.current.hydratedArticleLinks["https://example.com/article"],
        ).toBe(true);
      });
    });
  }
});
