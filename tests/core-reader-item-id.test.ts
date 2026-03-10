import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("core/reader-item-id", () => {
  test("encodes and decodes hex/decimal reader ids", async () => {
    const { toReaderItemId, parseReaderItemId } =
      await import("@/lib/core/stream-ids");

    const encoded = toReaderItemId(255);
    expect(encoded.endsWith("ff")).toBe(true);
    expect(parseReaderItemId(encoded)).toBe(255);
    expect(parseReaderItemId("255")).toBe(597);
    expect(parseReaderItemId("tag:google.com,2005:reader/item/0")).toBeNull();
    expect(parseReaderItemId(" ")).toBeNull();
  });
});

describe("core/feed-parser", () => {
  test("date parsing, dedupe, ranges, and item mapping", async () => {
    const {
      parseFeedItemDate,
      dedupePendingArticles,
      getPublicationDateRange,
      toPendingArticle,
    } = await import("@/lib/core/feed-parser");

    const fallback = new Date("2024-01-01T00:00:00.000Z");
    expect(parseFeedItemDate("invalid", fallback).toISOString()).toBe(
      fallback.toISOString(),
    );

    const now = new Date("2024-01-02T00:00:00.000Z");
    const items = [
      {
        title: "Old",
        link: " https://example.com/a ",
        publicationDate: fallback,
        content: "x",
        feedId: 1,
        lastChecked: now,
      },
      {
        title: "New",
        link: "https://example.com/a",
        publicationDate: now,
        content: "long content",
        feedId: 1,
        lastChecked: now,
      },
    ];

    const deduped = dedupePendingArticles(items);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.title).toBe("New");

    const range = getPublicationDateRange(deduped);
    expect(range.oldestPublicationDate).toBe("2024-01-02T00:00:00.000Z");
    expect(range.newestPublicationDate).toBe("2024-01-02T00:00:00.000Z");

    const mapped = toPendingArticle(
      {
        title: "A",
        link: "https://example.com/post",
        pubDate: "2024-01-03T00:00:00.000Z",
        contentSnippet: "snippet",
      },
      7,
      now,
    );
    expect(mapped?.feedId).toBe(7);
    expect(mapped?.link).toBe("https://example.com/post");
  });
});
