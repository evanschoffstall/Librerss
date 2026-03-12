import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("greader services/stream-service", () => {
  test("parseStreamPaging handles default, netnewswire, offset, and continuation id", async () => {
    const { parseStreamPaging } =
      await import("@/lib/api/greader/stream-service");

    const defaultPaging = parseStreamPaging(new URLSearchParams(), "Mozilla");
    expect(defaultPaging.limit).toBeGreaterThan(0);
    expect(defaultPaging.offset).toBe(0);
    expect(defaultPaging.continuationId).toBeNull();
    expect(defaultPaging.isNetNewsWire).toBe(false);

    const nwwPaging = parseStreamPaging(
      new URLSearchParams("n=9999"),
      "NetNewsWire/6.0",
    );
    expect(nwwPaging.isNetNewsWire).toBe(true);
    expect(nwwPaging.limit).toBeGreaterThan(200);

    const offsetPaging = parseStreamPaging(
      new URLSearchParams("c=offset:30&n=20"),
      "Mozilla",
    );
    expect(offsetPaging.offset).toBe(30);
    expect(offsetPaging.continuationId).toBeNull();
    expect(offsetPaging.limit).toBe(20);

    const continuationPaging = parseStreamPaging(
      new URLSearchParams("c=1234"),
      "Mozilla",
    );
    expect(continuationPaging.offset).toBe(0);
    expect(continuationPaging.continuationId).toBe(1234);

    const invalidContinuation = parseStreamPaging(
      new URLSearchParams("c=offset:-2"),
      "Mozilla",
    );
    expect(invalidContinuation.offset).toBe(0);
    expect(invalidContinuation.continuationId).toBeNull();
  });

  test("parseStreamId, parseOlderThanDate, and shouldExcludeReadFromStream branches", async () => {
    const { parseOlderThanDate, parseStreamId, shouldExcludeReadFromStream } =
      await import("@/lib/api/greader/stream-service");
    const { READ_STATE, READING_LIST_STREAM } =
      await import("@/lib/core/stream-ids");

    expect(
      parseStreamId(
        "stream/contents/user%2F-%2Fstate%2Fcom.google%2Freading-list",
      ),
    ).toBe("user/-/state/com.google/reading-list");

    const parsedDate = parseOlderThanDate(
      new URLSearchParams(`ot=${Math.floor(Date.now() / 1000)}`),
    );
    expect(parsedDate).toBeInstanceOf(Date);

    expect(parseOlderThanDate(new URLSearchParams("ot=0"))).toBeNull();
    expect(
      parseOlderThanDate(new URLSearchParams("ot=not-a-number")),
    ).toBeNull();

    expect(shouldExcludeReadFromStream([READ_STATE])).toBe(true);
    expect(shouldExcludeReadFromStream([READ_STATE])).toBe(true);
    expect(shouldExcludeReadFromStream([])).toBe(false);
  });
});

describe("greader utils/mappers", () => {
  test("toReaderIconUrl maps valid feed URL and rejects invalid values", async () => {
    const { toReaderIconUrl } = await import("@/lib/api/greader/mappers");

    expect(toReaderIconUrl("https://sub.example.com/feed.xml")).toContain(
      "domain=sub.example.com",
    );
    expect(toReaderIconUrl("not-a-url")).toBeNull();
  });

  test("mapArticleAsItem builds reader payload with category fallback and states", async () => {
    const { mapArticleAsItem } = await import("@/lib/api/greader/mappers");
    const {
      READ_STATE,
      READING_LIST_STREAM,
      STARRED_STATE,
      USER_LABEL_PREFIX,
    } = await import("@/lib/core/stream-ids");

    const publicationDate = new Date("2024-01-02T03:04:05.000Z");

    const fullRow = {
      articleId: 123,
      category: "Tech",
      content: "<p>body</p>",
      isRead: true,
      isStarred: true,
      link: "https://example.com/item",
      publicationDate,
      sourceName: "Feed name",
      sourceUrl: "https://example.com/feed",
      title: "Item title",
    };

    const fullItem = mapArticleAsItem(fullRow as any);
    expect(fullItem.id).toContain("reader/item/");
    expect(fullItem.title).toBe("Item title");
    expect(fullItem.canonical[0]?.href).toBe("https://example.com/item");
    expect(fullItem.content).toEqual({
      content: "<p>body</p>",
      direction: "ltr",
    });
    expect(fullItem.summary).toEqual({
      content: "<p>body</p>",
      direction: "ltr",
    });
    expect(fullItem.origin.streamId).toContain("feed/");
    expect(fullItem.categories).toContain(READING_LIST_STREAM);
    expect(fullItem.categories).toContain(`${USER_LABEL_PREFIX}Tech`);
    expect(fullItem.categories).toContain(READ_STATE);
    expect(fullItem.categories).toContain(STARRED_STATE);

    const fallbackRow = {
      ...fullRow,
      category: "   ",
      content: "   ",
      isRead: false,
      isStarred: false,
    };
    const fallbackItem = mapArticleAsItem(fallbackRow as any);
    expect(
      fallbackItem.categories.some((entry: string) =>
        entry.startsWith(USER_LABEL_PREFIX),
      ),
    ).toBe(true);
    expect(fallbackItem.summary).toEqual({
      content: "Item title",
      direction: "ltr",
    });
    expect(fallbackItem.categories.includes(READ_STATE)).toBe(false);
    expect(fallbackItem.categories.includes(STARRED_STATE)).toBe(false);
  });
});

describe("api/request helpers", () => {
  test("parseJsonBody validates body size and malformed json", async () => {
    const { parseJsonBody } = await import("@/lib/api/http");

    const oversizedByHeader = new Request("https://example.com", {
      body: "{}",
      headers: { "content-length": "99999" },
      method: "POST",
    });
    const oversizedResult = await parseJsonBody(oversizedByHeader, {
      maxBytes: 10,
    });
    expect(oversizedResult.ok).toBe(false);

    const malformed = new Request("https://example.com", {
      body: "{bad-json",
      method: "POST",
    });
    const malformedResult = await parseJsonBody(malformed, { maxBytes: 100 });
    expect(malformedResult.ok).toBe(false);
  });

  test("parseFormOrQueryParams handles GET, urlencoded, multipart fallback paths", async () => {
    const { asTrimmedString, getSearchParams, parseFormOrQueryParams } =
      await import("@/lib/api/http");
    const { parseDateOrNull } = await import("@/lib/utils/dates");

    const getRequest = new Request("https://example.com/path?x=1&y=2");
    const getParams = await parseFormOrQueryParams(getRequest);
    expect(getParams).toBeInstanceOf(URLSearchParams);
    expect((getParams as URLSearchParams).get("x")).toBe("1");

    const urlencodedRequest = new Request("https://example.com/path", {
      body: "a=1&b=2",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const formParams = await parseFormOrQueryParams(urlencodedRequest, {
      maxBytes: 100,
    });
    expect((formParams as URLSearchParams).get("a")).toBe("1");

    const multipartBad = new Request("https://example.com/path", {
      body: "--not-really-multipart",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      method: "POST",
    });
    const multipartResult = await parseFormOrQueryParams(multipartBad, {
      maxBytes: 100,
    });
    expect(multipartResult).toBeInstanceOf(Response);

    const oversizedBody = new Request("https://example.com/path", {
      body: "x=" + "a".repeat(50),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const oversizedParams = await parseFormOrQueryParams(oversizedBody, {
      maxBytes: 10,
    });
    expect(oversizedParams).toBeInstanceOf(Response);

    expect(getSearchParams(getRequest).get("y")).toBe("2");
    expect(asTrimmedString("  hi  ")).toBe("hi");
    expect(asTrimmedString(12)).toBe("");
    expect(parseDateOrNull("2024-01-01T00:00:00.000Z")).toBeInstanceOf(Date);
    expect(parseDateOrNull(123)).toBeNull();
  });
});

// ── lib/api/greader/subscription – handleSubscriptionEdit tag-less branch ─────

describe("lib/api/greader/subscription – handleSubscriptionEdit branches", () => {
  test("returns OK when subscription ID lacks FEED_STREAM_PREFIX", async () => {
    const { handleSubscriptionEdit } =
      await import("@/lib/api/greader/subscription");

    const user = {
      email: "test@example.com",
      sessionToken: "tok",
      userId: 1,
    };
    const req = new Request(
      "https://example.com/greader.php/api/0/subscription/edit",
      {
        body: "s=not-a-feed-prefix-subscription&ac=edit",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
    );

    const result = await handleSubscriptionEdit(user as any, req as any);
    const text = await result.text();
    expect(text).toBe("OK\n");
  });

  test("handleSubscriptionQuickAdd returns 400 for too-long URL", async () => {
    const { handleSubscriptionQuickAdd } =
      await import("@/lib/api/greader/subscription");

    const user = {
      email: "test@example.com",
      sessionToken: "tok",
      userId: 1,
    };
    const longUrl = "https://example.com/" + "a".repeat(2050);
    const req = new Request(
      "https://example.com/greader.php/api/0/subscription/quickadd",
      {
        body: `quickadd=${encodeURIComponent(longUrl)}`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
    );

    const result = await handleSubscriptionQuickAdd(user as any, req as any);
    expect(result.status).toBe(400);
    const json = await result.json();
    expect(json.numResults).toBe(0);
  });

  test("handleSubscriptionQuickAdd returns 400 for invalid URL", async () => {
    const { handleSubscriptionQuickAdd } =
      await import("@/lib/api/greader/subscription");

    const user = {
      email: "test@example.com",
      sessionToken: "tok",
      userId: 1,
    };
    const req = new Request(
      "https://example.com/greader.php/api/0/subscription/quickadd",
      {
        body: `quickadd=not-a-valid-url-at-all`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
    );

    const result = await handleSubscriptionQuickAdd(user as any, req as any);
    expect(result.status).toBe(400);
  });
});

// ── lib/api/greader/subscription – early Response returns (lines 75, 133) ─────

describe("lib/api/greader/subscription – parseFormOrQueryParams Response paths", () => {
  test("handleSubscriptionQuickAdd returns 413 when body too large (line 75)", async () => {
    const { NextRequest } = await import("next/server");
    const { handleSubscriptionQuickAdd } =
      await import("@/lib/api/greader/subscription");
    const user = { email: "test@example.com", sessionToken: "tok", userId: 1 };
    const req = new NextRequest(
      "https://dummy.local/api/greader/subscription/quickadd",
      {
        body: "quickadd=https%3A%2F%2Fexample.com%2Ffeed",
        headers: {
          "content-length": "999999999",
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
    );
    const result = await handleSubscriptionQuickAdd(user as any, req);
    expect(result.status).toBe(413);
  });

  test("handleSubscriptionEdit returns 413 when body too large (line 133)", async () => {
    const { NextRequest } = await import("next/server");
    const { handleSubscriptionEdit } =
      await import("@/lib/api/greader/subscription");
    const user = { email: "test@example.com", sessionToken: "tok", userId: 1 };
    const req = new NextRequest(
      "https://dummy.local/api/greader/subscription/edit",
      {
        body: "s=feed%2Fhttps%3A%2F%2Fexample.com&ac=edit",
        headers: {
          "content-length": "999999999",
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
    );
    const result = await handleSubscriptionEdit(user as any, req);
    expect(result.status).toBe(413);
  });
});
