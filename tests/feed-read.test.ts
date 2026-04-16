import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { handleFeedRead } from "@/lib/api/feed-source-api/read";
import { invalidateUserFeedSourceListCache } from "@/lib/core/server";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils";

const TEST_USER_ID = 424242;

beforeEach(() => {
  invalidateUserFeedSourceListCache(TEST_USER_ID);
  mock.restore();
});

afterEach(() => {
  invalidateUserFeedSourceListCache(TEST_USER_ID);
  mock.restore();
});

describe("handleFeedRead", () => {
  test("caches the feed-source list per user after the first database read", async () => {
    const listFeedSourcesForUserFn = mock(async () => [
      {
        category: null,
        enabled: true,
        id: 1,
        name: "Alpha Feed",
        url: "https://example.com/feed.xml",
      },
    ]);
    const logInfo = mock((_message: string) => {});

    const firstResponse = await handleFeedRead(TEST_USER_ID, null, {
      listFeedSourcesForUserFn,
      logInfo,
    });
    const secondResponse = await handleFeedRead(TEST_USER_ID, null, {
      listFeedSourcesForUserFn,
      logInfo,
    });

    expect(listFeedSourcesForUserFn).toHaveBeenCalledTimes(1);
    await expect(firstResponse.json()).resolves.toEqual([
      {
        category: DEFAULT_CATEGORY_LABEL,
        enabled: true,
        id: 1,
        name: "Alpha Feed",
        url: "https://example.com/feed.xml",
      },
    ]);
    await expect(secondResponse.json()).resolves.toEqual([
      {
        category: DEFAULT_CATEGORY_LABEL,
        enabled: true,
        id: 1,
        name: "Alpha Feed",
        url: "https://example.com/feed.xml",
      },
    ]);
    expect(logInfo).toHaveBeenCalledTimes(2);
    const [firstLogCall, secondLogCall] = logInfo.mock.calls;
    expect(firstLogCall).toBeDefined();
    expect(secondLogCall).toBeDefined();
    expect(firstLogCall?.[0]).toContain("resolved=database");
    expect(secondLogCall?.[0]).toContain("resolved=memory");
  });

  test("invalidating the feed-source list cache forces the next read back to the database", async () => {
    const listFeedSourcesForUserFn = mock(async () => [
      {
        category: "Tech",
        enabled: true,
        id: 1,
        name: "Alpha Feed",
        url: "https://example.com/feed.xml",
      },
    ]);

    await handleFeedRead(TEST_USER_ID, null, { listFeedSourcesForUserFn });
    invalidateUserFeedSourceListCache(TEST_USER_ID);
    await handleFeedRead(TEST_USER_ID, null, { listFeedSourcesForUserFn });

    expect(listFeedSourcesForUserFn).toHaveBeenCalledTimes(2);
  });

  test("single-feed article reads bypass the feed-source list cache", async () => {
    const fetchAndCacheFeedArticlesFn = mock(async () => [
      {
        content: "Article",
        feedId: 1,
        id: 9,
        isRead: false,
        isStarred: false,
        lastChecked: new Date("2026-03-14T12:00:00.000Z"),
        link: "https://example.com/article",
        publicationDate: new Date("2026-03-14T12:00:00.000Z"),
        title: "Article",
      },
    ]);
    const getDbFn = mock(() => ({ mocked: true }) as never);

    const response = await handleFeedRead(
      TEST_USER_ID,
      "https://example.com/feed.xml",
      {
        fetchAndCacheFeedArticlesFn,
        getDbFn,
      },
    );

    expect(getDbFn).toHaveBeenCalledTimes(1);
    expect(fetchAndCacheFeedArticlesFn).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual([
      {
        content: "Article",
        feedId: 1,
        id: 9,
        isRead: false,
        isStarred: false,
        lastChecked: "2026-03-14T12:00:00.000Z",
        link: "https://example.com/article",
        publicationDate: "2026-03-14T12:00:00.000Z",
        title: "Article",
      },
    ]);
  });
});
