import { describe, expect, mock, test } from "bun:test";
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

mock.module("@/lib/db/db", () => ({
  getDb: () => ({
    select: () => {
      const behavior = selectBehaviors.shift();
      if (!behavior) {
        throw new Error("No queued select behavior for greader route test");
      }

      return createSelectBuilder(behavior);
    },
  }),
}));

mock.module("@/lib/auth/session", () => ({
  createSession: async () => "session-token",
  getUserFromRequest: async () => ({
    userId: 1,
    email: "test@example.com",
  }),
  getUserFromSessionToken: async () => null,
  verifyPassword: async () => false,
}));

mock.module("@/lib/core/runtime", () => ({
  PLACEHOLDER_ADMIN_USER: {
    id: 1,
    email: "placeholder@example.com",
    passwordHash: "",
  },
  RUNTIME_FLAGS: {
    usePlaceholderData: false,
    allowPlaceholderAuth: false,
  },
}));

const routeModulePromise = import("@/app/api/greader.php/[...segments]/route");

describe("greader route compatibility contracts", () => {
  test("token endpoint returns plain alphanumeric token", async () => {
    selectBehaviors.length = 0;

    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/token",
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

  test("stream/items/ids returns decimal ids for Reader API clients", async () => {
    selectBehaviors.length = 0;
    selectBehaviors.push(
      {
        limitError: {
          code: "42P01",
          message: 'relation "ArticleStatus" does not exist',
        },
      },
      {
        offsetResult: [
          { articleId: 42, isRead: false, isStarred: false },
          { articleId: 255, isRead: false, isStarred: false },
        ],
      },
    );

    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/stream/items/ids?s=user/-/state/com.google/reading-list&output=json&n=2",
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
    expect(payload.itemRefs).toEqual([{ id: "42" }, { id: "255" }]);
    expect(payload.continuation).toBe("255");
    expect(
      payload.itemRefs.some((item) => item.id.includes("tag:google.com")),
    ).toBe(false);
  });

  test("subscription/list returns all user subscriptions even if feed join is missing", async () => {
    selectBehaviors.length = 0;
    selectBehaviors.push({
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
    });

    const { GET } = await routeModulePromise;

    const request = new NextRequest(
      "https://example.com/api/greader.php/reader/api/0/subscription/list?output=json",
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
    expect(payload.subscriptions[1]?.categories).toEqual([
      {
        id: "user/-/label/My Feeds",
        label: "My Feeds",
      },
    ]);
  });
});
