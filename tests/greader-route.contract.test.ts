import { PLACEHOLDER_ADMIN_USER } from "@/lib/core/runtime";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type SelectBehavior = {
  limitResult?: unknown;
  limitError?: unknown;
  whereResult?: unknown;
  offsetResult?: unknown;
};

const selectBehaviors: SelectBehavior[] = [];

function createSelectBuilder(behavior: SelectBehavior) {
  let terminal: "where" | "limit" | "offset" | null = null;

  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    groupBy: () => builder,
    orderBy: () => builder,
    where: () => {
      terminal = "where";
      return builder;
    },
    limit: () => {
      terminal = "limit";
      return builder;
    },
    offset: () => {
      terminal = "offset";
      return builder;
    },
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?:
        | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): Promise<TResult1 | TResult2> => {
      const valuePromise = (() => {
        if (terminal === "limit") {
          if (behavior.limitError) {
            throw behavior.limitError;
          }
          return behavior.limitResult ?? [];
        }

        if (terminal === "offset") {
          return behavior.offsetResult ?? [];
        }

        if (terminal === "where") {
          return behavior.whereResult ?? [];
        }

        return [];
      })();

      return Promise.resolve(valuePromise).then(onfulfilled, onrejected);
    },
  };

  return builder;
}

function registerDbMock() {
  mock.module("@/lib/db/db", () => ({
    getDb: () => ({
      select: () => {
        const behavior = selectBehaviors.shift() ?? {};
        return createSelectBuilder(behavior);
      },
    }),
  }));
}

let routeModulePromise: Promise<
  typeof import("@/app/api/greader.php/[...segments]/route")
>;

let previousDbUrl: string | undefined;

describe("greader route compatibility contracts", () => {
  beforeEach(() => {
    selectBehaviors.length = 0;
    previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    mock.restore();
    registerDbMock();
    routeModulePromise = import("@/app/api/greader.php/[...segments]/route");
  });

  afterEach(() => {
    process.env.DATABASE_URL = previousDbUrl;
    mock.restore();
  });

  test("rejects cross-site cookie-authenticated mutation requests", async () => {
    const { POST } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/subscription/edit",
      {
        method: "POST",
        headers: {
          cookie: "librerss_session=session-token",
          "sec-fetch-site": "cross-site",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "ac=unsubscribe&s=feed/https%3A%2F%2Fone.example%2Frss.xml",
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "subscription", "edit"],
      }),
    });

    expect(response.status).toBe(403);
  });

  test("token endpoint returns plain alphanumeric token", async () => {
    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/token",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "token"],
      }),
    });

    const body = await response.text();
    const token = body.trim();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(token).toMatch(/^[a-z0-9]+$/i);
  });

  test("ClientLogin rejects oversized request bodies", async () => {
    const { POST } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/accounts/ClientLogin",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "70000",
        },
        body: "Email=test@example.com&Passwd=password",
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({
        segments: ["accounts", "ClientLogin"],
      }),
    });

    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Error=RequestTooLarge\n");
  });

  test("stream/items/ids returns decimal ids for Reader API clients", async () => {
    selectBehaviors.push(
      {
        whereResult: [{ url: "https://one.example/rss.xml" }],
      },
      {
        limitError: {
          code: "42P01",
          message: 'relation "ArticleStatus" does not exist',
        },
      },
      {
        whereResult: [
          { articleId: 42, isRead: false, isStarred: false },
          { articleId: 255, isRead: false, isStarred: false },
        ],
        offsetResult: [
          { articleId: 42, isRead: false, isStarred: false },
          { articleId: 255, isRead: false, isStarred: false },
        ],
      },
    );

    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/ids?s=user/-/state/com.google/reading-list&output=json&n=2",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "stream", "items", "ids"],
      }),
    });

    const payload = (await response.json()) as {
      itemRefs: Array<{ id: string }>;
      continuation?: string;
    };

    expect(response.status).toBe(200);
    expect(Array.isArray(payload.itemRefs)).toBe(true);
    if (payload.itemRefs.length > 0) {
      expect(payload.itemRefs).toEqual([{ id: "42" }, { id: "255" }]);
      expect(payload.continuation).toBe("255");
    }
    expect(
      payload.itemRefs.some((item) => item.id.includes("tag:google.com")),
    ).toBe(false);
  });

  test("subscription/list returns all user subscriptions even if feed join is missing", async () => {
    selectBehaviors.push(
      {
        whereResult: [
          {
            sourceId: 1,
            title: "Feed One",
            url: "https://one.example/rss.xml",
            feedId: 10,
            category: "Tech",
          },
          {
            sourceId: 2,
            title: "Feed Two",
            url: "https://two.example/rss.xml",
            feedId: null,
            category: null,
          },
        ],
      },
      // Second query: loadUserCategoryFallbackByFeedUrl — no URL match for Feed Two
      {
        whereResult: [],
      },
    );

    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/subscription/list?output=json",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "subscription", "list"],
      }),
    });

    const payload = (await response.json()) as {
      subscriptions: Array<{
        id: string;
        title: string;
        iconUrl: string;
        categories: Array<{ id: string; label: string }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.subscriptions).toHaveLength(2);
    expect(
      payload.subscriptions.map((subscription) => subscription.id),
    ).toEqual([
      "feed/https://one.example/rss.xml",
      "feed/https://two.example/rss.xml",
    ]);
    expect(payload.subscriptions[0]?.categories).toEqual([
      {
        id: "user/-/label/Tech",
        label: "Tech",
      },
    ]);
    expect(payload.subscriptions[0]?.iconUrl).toBe(
      "https://www.google.com/s2/favicons?domain=one.example&sz=64",
    );
    expect(payload.subscriptions[1]?.categories).toEqual([]);
    expect(payload.subscriptions[1]?.iconUrl).toBe(
      "https://www.google.com/s2/favicons?domain=two.example&sz=64",
    );
  });

  test("subscription/list falls back to canonical URL category mapping", async () => {
    selectBehaviors.push(
      {
        whereResult: [
          {
            sourceId: 3,
            title: "BBC World",
            url: "https://feeds.bbci.co.uk/news/world/rss.xml",
            feedId: 30,
            category: null,
          },
        ],
      },
      {
        whereResult: [
          {
            category: "World",
            feedUrl: "http://feeds.bbci.co.uk/news/world/rss.xml",
          },
        ],
      },
    );

    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/subscription/list?output=json",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "subscription", "list"],
      }),
    });

    const payload = (await response.json()) as {
      subscriptions: Array<{
        categories: Array<{ id: string; label: string }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.subscriptions).toHaveLength(1);
    expect(payload.subscriptions[0]?.categories).toEqual([
      {
        id: "user/-/label/World",
        label: "World",
      },
    ]);
  });

  test("tag/list omits My Feeds when all feeds have explicit categories", async () => {
    selectBehaviors.push({
      whereResult: [
        { category: "World" },
        { category: "World" },
        { category: "US" },
        { category: "Science" },
      ],
    });

    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/tag/list?output=json",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "tag", "list"],
      }),
    });

    const payload = (await response.json()) as {
      tags: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);

    const labelIds = payload.tags.map((t) => t.id);
    expect(labelIds).toContain("user/-/label/World");
    expect(labelIds).toContain("user/-/label/US");
    expect(labelIds).toContain("user/-/label/Science");
    expect(labelIds).not.toContain("user/-/label/My Feeds");
  });

  test("tag/list includes My Feeds when at least one feed has no category", async () => {
    selectBehaviors.push(
      // First query: raw JOIN — one feed has no category assignment
      {
        whereResult: [{ category: "World" }, { category: null }],
      },
      // Second query: loadUserCategoryFallbackByFeedUrl — no URL fallback match
      {
        whereResult: [],
      },
    );

    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/tag/list?output=json",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "tag", "list"],
      }),
    });

    const payload = (await response.json()) as {
      tags: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);

    const labelIds = payload.tags.map((t) => t.id);
    expect(labelIds).toContain("user/-/label/My Feeds");
    expect(labelIds).toContain("user/-/label/World");
  });

  test("user-info endpoint returns authenticated identity payload", async () => {
    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/user-info",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "user-info"],
      }),
    });

    const payload = (await response.json()) as {
      userId: string;
      userName: string;
      userEmail: string;
      isBloggerUser: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.userId).toBe(String(PLACEHOLDER_ADMIN_USER.id));
    expect(payload.userName).toBe(PLACEHOLDER_ADMIN_USER.email);
    expect(payload.userEmail).toBe(PLACEHOLDER_ADMIN_USER.email);
    expect(payload.isBloggerUser).toBe(false);
  });

  test("unknown reader resource returns not found", async () => {
    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/unknown/resource",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "unknown", "resource"],
      }),
    });

    expect(response.status).toBe(404);
  });

  test("non-reader and non-client routes return not found", async () => {
    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/not-a-reader-route",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({ segments: ["not-a-reader-route"] }),
    });

    expect(response.status).toBe(404);
  });

  test("mutating bearer POST requires valid edit token", async () => {
    const { POST } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/edit-tag",
      {
        method: "POST",
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "i=tag:google.com,2005:reader/item/1&a=user/-/state/com.google/starred",
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ segments: ["reader", "api", "0", "edit-tag"] }),
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Error=InvalidToken\n");
  });

  test("read-only POST resource bypasses edit token validation", async () => {
    selectBehaviors.push(
      { whereResult: [{ url: "https://one.example/rss.xml" }] },
      { whereResult: [{ articleId: 11, isRead: false, isStarred: false }] },
    );

    const { POST } = await routeModulePromise;
    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/ids?s=user/-/state/com.google/reading-list&n=1",
      {
        method: "POST",
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({
        segments: ["reader", "api", "0", "stream", "items", "ids"],
      }),
    });

    expect(response.status).toBe(200);
  });

  test("stream/contents resources are dispatched by prefix match", async () => {
    selectBehaviors.push(
      { whereResult: [{ url: "https://one.example/rss.xml" }] },
      {
        whereResult: [
          {
            articleId: 101,
            title: "From stream contents",
            link: "https://one.example/articles/101",
            content: "<p>hello</p>",
            publicationDate: new Date("2024-01-01T00:00:00.000Z"),
            sourceName: "One",
            sourceUrl: "https://one.example/rss.xml",
            category: null,
            isRead: false,
            isStarred: false,
          },
        ],
        offsetResult: [
          {
            articleId: 101,
            title: "From stream contents",
            link: "https://one.example/articles/101",
            content: "<p>hello</p>",
            publicationDate: new Date("2024-01-01T00:00:00.000Z"),
            sourceName: "One",
            sourceUrl: "https://one.example/rss.xml",
            category: null,
            isRead: false,
            isStarred: false,
          },
        ],
      },
      { whereResult: [] },
    );

    const { GET } = await routeModulePromise;
    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=1",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({
        segments: [
          "reader",
          "api",
          "0",
          "stream",
          "contents",
          "user",
          "-",
          "state",
          "com.google",
          "reading-list",
        ],
      }),
    });

    expect(response.status).toBe(200);
  });

  test("token endpoint returns 500 when AUTH_SECRET is missing", async () => {
    const previousAuthSecret = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    mock.restore();
    registerDbMock();

    const moduleWithMissingSecret = await import(
      `@/app/api/greader.php/[...segments]/route?missing-auth-secret=${Date.now()}`
    );

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/token",
      {
        headers: {
          authorization: `GoogleLogin auth=${PLACEHOLDER_ADMIN_USER.sessionToken}`,
        },
      },
    );

    await expect(
      moduleWithMissingSecret.GET(request, {
        params: Promise.resolve({ segments: ["reader", "api", "0", "token"] }),
      }),
    ).rejects.toThrow("AUTH_SECRET");
    process.env.AUTH_SECRET = previousAuthSecret;
  });
});
