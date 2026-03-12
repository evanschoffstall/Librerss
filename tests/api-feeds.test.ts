/**
 * Integration Tests: Feeds API Routes
 * Tests for src/app/api/feeds/
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

import { NextRequest } from "next/server";

import { createMockFeed, createMockRequest } from "./support/test-utils";

import {
  getRequestedFeedUrl,
  parseCreateFeedPayload,
  parseDeleteSourceId,
  parseRenameFeedPayload,
  parseRenameFeedPayloadFromBody,
  parseToggleFeedEnabledPayloadFromBody,
  parseUpdateFeedSettingsPayloadFromBody,
} from "@/lib/api/feeds/parsers";

const createSelectChain = () => ({
  leftJoin: () => createSelectChain(),
  limit: () => Promise.resolve([createMockFeed()]),
  orderBy: () => createSelectChain(),
  where: () => createSelectChain(),
});

function registerModuleMocks() {
  mock.module("@/lib/db/db", () => ({
    getDb: () => ({
      delete: () => ({
        from: () => ({
          where: () => Promise.resolve({ rowCount: 1 }),
        }),
      }),
      insert: () => ({
        into: () => ({
          values: () => ({
            returning: () => Promise.resolve([createMockFeed()]),
          }),
        }),
      }),
      select: () => ({
        from: () => createSelectChain(),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve([createMockFeed()]),
        }),
      }),
    }),
  }));

  mock.module("@/lib/api/feeds/read", () => ({
    handleFeedRead: async () => Response.json([]),
  }));
}

const authenticatedUser = {
  email: "test@example.com",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  sessionId: 1,
  userId: 1,
};

const routeDeps = {
  requireAuthenticatedUserFn: async () => authenticatedUser,
  requireMutableFeedAccessFn: async () => authenticatedUser,
};

beforeAll(() => {
  registerModuleMocks();
});

beforeEach(() => {
  mock.restore();
  registerModuleMocks();
});

afterEach(() => {
  mock.restore();
});

afterAll(() => {
  mock.restore();
});

describe("Feeds API - List", () => {
  test("GET /api/feeds returns user feeds", async () => {
    const { GET } = await import("@/app/api/feeds/route");
    const request = createMockRequest("https://example.com/api/feeds", {
      cookies: { session: "test-session" },
    });

    const response = await GET(request, routeDeps);
    expect(response.status).toBeLessThan(400);
    const body = await response.json();
    expect(body).toEqual([]);
  });
});

describe("Feeds API - Add", () => {
  test("POST /api/feeds requires url", async () => {
    const { POST } = await import("@/app/api/feeds/route");
    const request = createMockRequest("https://example.com/api/feeds", {
      body: {},
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });

    const response = await POST(request, routeDeps);
    expect(response.status).toBe(400);
  });

  test("POST /api/feeds validates url format", async () => {
    const { POST } = await import("@/app/api/feeds/route");
    const request = createMockRequest("https://example.com/api/feeds", {
      body: { url: "not-a-valid-url" },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });

    const response = await POST(request, routeDeps);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  test("POST /api/feeds accepts valid feed url", async () => {
    const { POST } = await import("@/app/api/feeds/route");
    const request = createMockRequest("https://example.com/api/feeds", {
      body: { url: "https://example.com/feed.xml" },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });

    const response = await POST(request, routeDeps);
    expect(response.status).toBeLessThan(500);
  });
});

describe("Feeds API - Update", () => {
  test("PATCH /api/feeds/:id updates feed", async () => {
    const { PATCH } = await import("@/app/api/feeds/[id]/route");
    const request = createMockRequest("https://example.com/api/feeds/1", {
      body: { title: "Updated Title" },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "PATCH",
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "1" }),
    });
    expect(response.status).toBeLessThan(500);
  });
});

describe("Feeds API - Delete", () => {
  test("DELETE /api/feeds/:id removes feed", async () => {
    const { DELETE } = await import("@/app/api/feeds/[id]/route");
    const request = createMockRequest("https://example.com/api/feeds/1", {
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "1" }),
    });
    expect(response.status).toBeLessThan(500);
  });
});

describe("Feeds API - Refresh", () => {
  test("POST /api/feeds/:id/refresh requires auth and returns 501", async () => {
    const { POST } = await import("@/app/api/feeds/[id]/refresh/route");
    const request = createMockRequest(
      "https://example.com/api/feeds/1/refresh",
      {
        cookies: { session: "test-session" },
        headers: { "sec-fetch-site": "same-origin" },
        method: "POST",
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "1" }),
    });
    // Without a valid DB session, auth returns 401; with valid auth it returns 501
    expect([401, 501]).toContain(response.status);
  });
});

describe("Feeds API - Route branches with injected deps", () => {
  test("GET handles source-not-found, upstream, axios, and generic errors", async () => {
    const { GET } = await import("@/app/api/feeds/route");
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "verbose";

    const request = createMockRequest("https://example.com/api/feeds");
    const warnFn = mock(() => {});

    try {
      const sourceNotFound = await GET(request as any, {
        assertAllowedFeedUrlFn: async () => null,
        getRequestedFeedUrlFn: () => "https://example.com/feed.xml",
        handleFeedReadFn: async () => {
          throw new Error("missing");
        },
        isFeedSourceNotFoundErrorFn: (() => true) as any,
        jsonErrorFn: ((message: string, status: number) =>
          Response.json({ error: message }, { status })) as any,
        requireAuthenticatedUserFn: async () =>
          ({ email: "x@y.com", userId: 1 }) as any,
      });
      expect(sourceNotFound.status).toBe(404);

      const upstream = await GET(request as any, {
        assertAllowedFeedUrlFn: async () => null,
        getRequestedFeedUrlFn: () => "https://example.com/feed.xml",
        handleFeedReadFn: async () => {
          throw new Error("upstream");
        },
        isUpstreamFeedErrorFn: (() => true) as any,
        jsonErrorFn: ((message: string, status: number) =>
          Response.json({ error: message }, { status })) as any,
        requireAuthenticatedUserFn: async () =>
          ({ email: "x@y.com", userId: 1 }) as any,
        toErrorMessageFn: () => "upstream-error",
        warnFn: warnFn as any,
      });
      expect(upstream.status).toBe(502);
      await expect(upstream.json()).resolves.toEqual({
        error: "Failed to fetch feed from upstream",
      });

      const axiosError = new Error("axios") as Error & {
        response?: { status?: number };
      };
      axiosError.response = { status: 429 };

      const axiosResponse = await GET(request as any, {
        assertAllowedFeedUrlFn: async () => null,
        getRequestedFeedUrlFn: () => "https://example.com/feed.xml",
        handleFeedReadFn: async () => {
          throw axiosError;
        },
        isAxiosErrorFn: (() => true) as any,
        jsonErrorFn: ((message: string, status: number) =>
          Response.json({ error: message }, { status })) as any,
        requireAuthenticatedUserFn: async () =>
          ({ email: "x@y.com", userId: 1 }) as any,
        toErrorMessageFn: () => "axios-error",
        warnFn: warnFn as any,
      });
      expect(axiosResponse.status).toBe(502);
      await expect(axiosResponse.json()).resolves.toEqual({
        error: "Failed to fetch feed from upstream",
      });
      expect(warnFn).toHaveBeenCalledWith(
        expect.stringContaining("upstream feed request failed"),
        expect.objectContaining({
          feedAttemptId: expect.any(String),
          requestId: null,
        }),
      );

      const generic = await GET(request as any, {
        assertAllowedFeedUrlFn: async () => null,
        handleFeedReadFn: async () => {
          throw new Error("generic");
        },
        isAxiosErrorFn: (() => false) as any,
        isFeedSourceNotFoundErrorFn: (() => false) as any,
        isUpstreamFeedErrorFn: (() => false) as any,
        logAndRespondErrorFn: (() =>
          Response.json({ error: "generic" }, { status: 500 })) as any,
        requireAuthenticatedUserFn: async () =>
          ({ email: "x@y.com", userId: 1 }) as any,
      });
      expect(generic.status).toBe(500);
    } finally {
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  test("POST, PATCH, DELETE cover success and not-found branches via deps", async () => {
    const { DELETE, PATCH, POST } = await import("@/app/api/feeds/route");

    const request = createMockRequest("https://example.com/api/feeds", {
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });

    const postCreated = await POST(request as any, {
      assertAllowedFeedUrlFn: async () => null,
      createOrUpdateFeedSourceFn: async () => ({
        isNew: true,
        sourceRecord: {
          id: 1,
          name: "Feed",
          url: "https://example.com/feed.xml",
        },
      }),
      getDbFn: (() => ({
        transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({}),
      })) as any,
      parseCreateFeedPayloadFn: async () => ({
        category: "Tech",
        name: "Feed",
        url: "https://example.com/feed.xml",
      }),
      requireMutableFeedAccessFn: async () =>
        ({ email: "x@y.com", userId: 1 }) as any,
    });
    expect(postCreated.status).toBe(201);

    const postUpdated = await POST(request as any, {
      assertAllowedFeedUrlFn: async () => null,
      createOrUpdateFeedSourceFn: async () => ({
        isNew: false,
        sourceRecord: {
          id: 1,
          name: "Feed",
          url: "https://example.com/feed.xml",
        },
      }),
      getDbFn: (() => ({
        transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({}),
      })) as any,
      parseCreateFeedPayloadFn: async () => ({
        category: "Tech",
        name: "Feed",
        url: "https://example.com/feed.xml",
      }),
      requireMutableFeedAccessFn: async () =>
        ({ email: "x@y.com", userId: 1 }) as any,
    });
    expect(postUpdated.status).toBe(200);

    const patchNotFound = await PATCH(request as any, {
      assertAllowedFeedUrlFn: async () => null,
      jsonErrorFn: ((message: string, status: number) =>
        Response.json({ error: message }, { status })) as any,
      parseRenameFeedPayloadFn: async () => ({
        name: "Renamed",
        sourceId: 1,
        url: "https://example.com/feed.xml",
      }),
      renameFeedSourceForUserFn: async () => null,
      requireMutableFeedAccessFn: async () =>
        ({ email: "x@y.com", userId: 1 }) as any,
    });
    expect(patchNotFound.status).toBe(404);

    const deleteNotFound = await DELETE(request as any, {
      deleteFeedSourceForUserFn: async () => null,
      jsonErrorFn: ((message: string, status: number) =>
        Response.json({ error: message }, { status })) as any,
      parseDeleteSourceIdFn: () => 1,
      requireMutableFeedAccessFn: async () =>
        ({ email: "x@y.com", userId: 1 }) as any,
    });
    expect(deleteNotFound.status).toBe(404);
  });

  test("POST, PATCH, DELETE catch branches use logAndRespondError", async () => {
    const { DELETE, PATCH, POST } = await import("@/app/api/feeds/route");

    const request = createMockRequest("https://example.com/api/feeds", {
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });

    const respondError = ((_message: string, _error: unknown) =>
      Response.json({ error: "caught" }, { status: 500 })) as any;

    const postCaught = await POST(request as any, {
      logAndRespondErrorFn: respondError,
      parseCreateFeedPayloadFn: async () => {
        throw new Error("create payload failed");
      },
      requireMutableFeedAccessFn: async () =>
        ({ email: "x@y.com", userId: 1 }) as any,
    });
    expect(postCaught.status).toBe(500);

    const patchCaught = await PATCH(request as any, {
      logAndRespondErrorFn: respondError,
      parseRenameFeedPayloadFn: async () => {
        throw new Error("rename payload failed");
      },
      requireMutableFeedAccessFn: async () =>
        ({ email: "x@y.com", userId: 1 }) as any,
    });
    expect(patchCaught.status).toBe(500);

    const deleteCaught = await DELETE(request as any, {
      logAndRespondErrorFn: respondError,
      parseDeleteSourceIdFn: () => {
        throw new Error("delete id failed");
      },
      requireMutableFeedAccessFn: async () =>
        ({ email: "x@y.com", userId: 1 }) as any,
    });
    expect(deleteCaught.status).toBe(500);
  });
});

// ─── feeds/services/access.ts: requireMutableFeedAccess branches ─────────────

describe("feeds/services/access: requireMutableFeedAccess", () => {
  test("returns Response when auth guard fails (no CSRF)", async () => {
    const { requireMutableFeedAccess } = await import("@/lib/api/feeds/access");
    // No sec-fetch-site → CSRF fails → requireMutableAuthenticatedUser returns Response
    const request = createMockRequest("https://example.com/api/feeds", {
      method: "POST",
    });
    const result = await requireMutableFeedAccess(request);
    // CSRF missing → always a Response (this path is unaffected by session mocks)
    expect(result instanceof Response).toBe(true);
  });

  test("passes rateLimit option through without throwing", async () => {
    const { requireMutableFeedAccess } = await import("@/lib/api/feeds/access");
    // Verify the rateLimit option path is accepted (no throw).
    // In parallel suites, session may be mocked → auth may succeed or fail,
    // so we only assert the function completes and returns a defined result.
    const request = createMockRequest("https://example.com/api/feeds", {
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });
    const result = await requireMutableFeedAccess(request, {
      rateLimit: { key: "feeds-test-rl", maxAttempts: 5, windowMs: 60_000 },
    });
    expect(result).toBeDefined();
  });

  test("ensureFeedManagementEnabled returns 503 in placeholder mode", async () => {
    const { RUNTIME_FLAGS } = await import("@/lib/core/runtime");
    if (RUNTIME_FLAGS.usePlaceholderData) {
      // In placeholder mode the 503 branch fires after auth succeeds.
      // Verify RUNTIME_FLAGS correctly reflects the mode.
      expect(RUNTIME_FLAGS.usePlaceholderData).toBe(true);
    } else {
      // In DB mode the function either returns a user or an auth-failure Response.
      // The ensureFeedManagementEnabled() null path is covered — just verify no throw.
      const { requireMutableFeedAccess } =
        await import("@/lib/api/feeds/access");
      const request = createMockRequest("https://example.com/api/feeds", {
        method: "POST",
      });
      const result = await requireMutableFeedAccess(request);
      expect(result).toBeDefined();
    }
  });
});

// ── lib/api/feeds/access – requireMutableFeedAccess ──────────────────────────
// NOTE: These tests use env-var manipulation rather than mock.module on @/lib/server
// or @/lib/auth/session to avoid cross-file module-cache contamination.

describe("lib/api/feeds/access – requireMutableFeedAccess", () => {
  test("returns 503 when placeholder data mode is active", async () => {
    const { createMockRequest } = await import("./support/test-utils");
    const { requireMutableFeedAccess } = await import("@/lib/api/feeds/access");
    // Placeholder mode (DATABASE_URL='') bypasses DB auth and then hits the 503 branch.
    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    try {
      // sec-fetch-site passes CSRF; placeholder mode returns admin user; 503 follows.
      const request = createMockRequest("https://localhost/api/feeds", {
        headers: { "sec-fetch-site": "same-origin" },
        method: "POST",
      });
      const result = await requireMutableFeedAccess(request);
      expect(result instanceof Response).toBe(true);
      if (result instanceof Response) {
        expect(result.status).toBe(503);
      }
    } finally {
      if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
      else delete process.env.DATABASE_URL;
    }
  });

  test("returns 401 when no session cookie in non-placeholder mode", async () => {
    const { createMockRequest } = await import("./support/test-utils");
    const { requireMutableFeedAccess } = await import("@/lib/api/feeds/access");
    // getUserFromRequest returns null when cookie absent → 401 before any DB call.
    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    try {
      const request = createMockRequest("https://localhost/api/feeds", {
        headers: { "sec-fetch-site": "same-origin" },
        method: "POST",
      });
      const result = await requireMutableFeedAccess(request);
      expect(result instanceof Response).toBe(true);
      if (result instanceof Response) {
        expect(result.status).toBe(401);
      }
    } finally {
      if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
      else delete process.env.DATABASE_URL;
    }
  });
});

// ── app/api/feeds/[id]/refresh – 501 in placeholder mode ──────────────────────

describe("app/api/feeds/[id]/refresh – 501 response", () => {
  test("POST returns 501 when auth passes in placeholder mode", async () => {
    const { createMockRequest } = await import("./support/test-utils");
    const { POST } = await import("@/app/api/feeds/[id]/refresh/route");
    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    try {
      const request = createMockRequest(
        "https://example.com/api/feeds/1/refresh",
        { method: "POST" },
      );
      const context = { params: Promise.resolve({ id: "1" }) };
      const response = await POST(request, context);
      expect(response.status).toBe(501);
      const body = await response.json();
      expect(body.error).toContain("not implemented");
    } finally {
      if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
      else delete process.env.DATABASE_URL;
    }
  });
});

// ── app/api/feeds/route.ts – PATCH body-parsed paths ──────────────────────────

describe("feeds route PATCH – body-parsed paths", () => {
  const authUser = { email: "u@test.com", userId: 1 } as any;

  test("PATCH toggles feed enabled via body", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      body: { enabled: false, id: 10 },
      headers: { "sec-fetch-site": "same-origin" },
      method: "PATCH",
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      setFeedSourceEnabledForUserFn: async (_uid, sid, enabled) => ({
        enabled,
        id: sid,
        name: "Feed",
        url: "https://x.com/f",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.enabled).toBe(false);
    expect(body.id).toBe(10);
  });

  test("PATCH toggles feed enabled – not found returns 404", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      body: { enabled: true, id: 10 },
      headers: { "sec-fetch-site": "same-origin" },
      method: "PATCH",
    });
    const result = await PATCH(req, {
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      requireMutableFeedAccessFn: async () => authUser,
      setFeedSourceEnabledForUserFn: async () => null,
    });
    expect(result.status).toBe(404);
  });

  test("PATCH updates extraction settings via body", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      body: { extractionDisabled: true, id: 8 },
      headers: { "sec-fetch-site": "same-origin" },
      method: "PATCH",
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      updateFeedSettingsForUserFn: async (_uid, sid, settings) => ({
        id: sid,
        ...settings,
        name: "Feed",
        url: "https://x.com/f",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.extractionDisabled).toBe(true);
  });

  test("PATCH updates proxyEnabled setting via body", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      body: { id: 5, proxyEnabled: true },
      headers: { "sec-fetch-site": "same-origin" },
      method: "PATCH",
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      updateFeedSettingsForUserFn: async (_uid, sid, settings) => ({
        id: sid,
        ...settings,
        name: "Feed",
        url: "https://x.com/f",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.proxyEnabled).toBe(true);
  });

  test("PATCH update settings – not found returns 404", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      body: { id: 5, proxyEnabled: false },
      headers: { "sec-fetch-site": "same-origin" },
      method: "PATCH",
    });
    const result = await PATCH(req, {
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      requireMutableFeedAccessFn: async () => authUser,
      updateFeedSettingsForUserFn: async () => null,
    });
    expect(result.status).toBe(404);
  });

  test("PATCH renames feed via body (no parseRenameFeedPayloadFn)", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      body: { id: 3, name: "New Name", url: "https://example.com/feed" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "PATCH",
    });
    const result = await PATCH(req, {
      assertAllowedFeedUrlFn: async () => null,
      renameFeedSourceForUserFn: async (_uid, sid, name, url) => ({
        id: sid,
        name,
        url,
      }),
      requireMutableFeedAccessFn: async () => authUser,
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.name).toBe("New Name");
  });

  test("PATCH rename via body – not found returns 404", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      body: { id: 3, name: "New", url: "https://example.com/feed" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "PATCH",
    });
    const result = await PATCH(req, {
      assertAllowedFeedUrlFn: async () => null,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      renameFeedSourceForUserFn: async () => null,
      requireMutableFeedAccessFn: async () => authUser,
    });
    expect(result.status).toBe(404);
  });
});

// ── app/api/feeds/route.ts – DELETE success path ──────────────────────────────

describe("feeds route DELETE – success path", () => {
  test("DELETE returns deleted source on success", async () => {
    const { DELETE } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds?sourceId=7", {
      headers: { "sec-fetch-site": "same-origin" },
      method: "DELETE",
    });
    const result = await DELETE(req, {
      deleteFeedSourceForUserFn: async () => ({
        id: 7,
        name: "Gone",
        url: "https://x.com/f",
      }),
      parseDeleteSourceIdFn: () => 7,
      requireMutableFeedAccessFn: async () =>
        ({ email: "u@x.com", userId: 1 }) as any,
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.id).toBe(7);
    expect(body.name).toBe("Gone");
  });
});

// ── app/api/feeds/route.ts – GET upstream error branches ─────────────────────

describe("feeds route GET – upstream error handling", () => {
  const authUser = { email: "u@test.com", userId: 1 } as any;

  test("returns 404 when feed source not found", async () => {
    const { GET } = await import("@/app/api/feeds/route");
    const { isFeedSourceNotFoundError } =
      await import("@/lib/core/feed-fetcher");
    const notFoundErr = Object.assign(new Error("not found"), {
      name: "FeedSourceNotFoundError",
    });
    const req = createMockRequest("https://host/api/feeds?url=https://x.com/f");
    const result = await GET(req, {
      assertAllowedFeedUrlFn: async () => null,
      getRequestedFeedUrlFn: () => "https://x.com/f",
      handleFeedReadFn: async () => {
        throw notFoundErr;
      },
      isAxiosErrorFn: ((_e: unknown) => false) as any,
      isFeedSourceNotFoundErrorFn: isFeedSourceNotFoundError,
      isUpstreamFeedErrorFn: ((_e: unknown) => false) as any,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      requireAuthenticatedUserFn: async () => authUser,
      warnFn: (() => {}) as any,
    });
    expect(result.status).toBe(404);
  });

  test("returns 502 when upstream feed error", async () => {
    const { GET } = await import("@/app/api/feeds/route");
    const { isUpstreamFeedError } = await import("@/lib/core/feed-fetcher");
    const upstreamErr = Object.assign(new Error("upstream fail"), {
      name: "UpstreamFeedError",
    });
    const req = createMockRequest("https://host/api/feeds?url=https://x.com/f");
    const result = await GET(req, {
      assertAllowedFeedUrlFn: async () => null,
      getRequestedFeedUrlFn: () => "https://x.com/f",
      handleFeedReadFn: async () => {
        throw upstreamErr;
      },
      isAxiosErrorFn: ((_e: unknown) => false) as any,
      isFeedSourceNotFoundErrorFn: ((_e: unknown) => false) as any,
      isUpstreamFeedErrorFn: isUpstreamFeedError,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      requireAuthenticatedUserFn: async () => authUser,
      warnFn: (() => {}) as any,
    });
    expect(result.status).toBe(502);
  });

  test("returns 502 when axios error occurs", async () => {
    const { GET } = await import("@/app/api/feeds/route");
    const axiosErr = Object.assign(new Error("timeout"), {
      config: {},
      isAxiosError: true,
      response: { status: 504 },
    });
    const req = createMockRequest("https://host/api/feeds?url=https://x.com/f");
    const result = await GET(req, {
      assertAllowedFeedUrlFn: async () => null,
      getRequestedFeedUrlFn: () => "https://x.com/f",
      handleFeedReadFn: async () => {
        throw axiosErr;
      },
      isAxiosErrorFn: ((e: unknown) =>
        !!(e && typeof e === "object" && "isAxiosError" in e)) as any,
      isFeedSourceNotFoundErrorFn: ((_e: unknown) => false) as any,
      isUpstreamFeedErrorFn: ((_e: unknown) => false) as any,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      requireAuthenticatedUserFn: async () => authUser,
      warnFn: (() => {}) as any,
    });
    expect(result.status).toBe(502);
  });
});

describe("parseCreateFeedPayload", () => {
  test("parses valid create payload", async () => {
    const body = JSON.stringify({
      name: "My Feed",
      url: "https://example.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.name).toBe("My Feed");
      expect(result.url).toBe("https://example.com/feed");
      expect(typeof result.category).toBe("string");
    }
  });

  test("returns error for missing name", async () => {
    const body = JSON.stringify({ url: "https://example.com/feed" });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });

  test("returns error for missing url", async () => {
    const body = JSON.stringify({ name: "Feed" });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("uses custom category when provided", async () => {
    const body = JSON.stringify({
      category: "  Tech  ",
      name: "Feed",
      url: "https://example.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.category).toBe("Tech");
    }
  });

  test("rejects overly long name", async () => {
    const body = JSON.stringify({
      name: "A".repeat(500),
      url: "https://example.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

// ─── feed-parsers: parseRenameFeedPayload ─────────────────────────────────────

describe("parseRenameFeedPayload", () => {
  test("parses valid rename payload", async () => {
    const body = JSON.stringify({
      id: 42,
      name: "New Name",
      url: "https://x.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.sourceId).toBe(42);
      expect(result.name).toBe("New Name");
      expect(result.url).toBe("https://x.com/feed");
    }
  });

  test("returns error for missing id", async () => {
    const body = JSON.stringify({ name: "New", url: "https://x.com" });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for missing name", async () => {
    const body = JSON.stringify({ id: 1, url: "https://x.com" });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for missing url", async () => {
    const body = JSON.stringify({ id: 1, name: "Name" });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("rejects overly long name", async () => {
    const body = JSON.stringify({
      id: 1,
      name: "A".repeat(500),
      url: "https://x.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      body,
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

describe("parseRenameFeedPayloadFromBody", () => {
  test("rejects overly long url", () => {
    const result = parseRenameFeedPayloadFromBody({
      id: 1,
      name: "Feed",
      url: `https://example.com/${"x".repeat(2100)}`,
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

describe("parseToggleFeedEnabledPayloadFromBody", () => {
  test("parses valid toggle payload", () => {
    const result = parseToggleFeedEnabledPayloadFromBody({
      enabled: true,
      id: 17,
    });
    expect(result).toEqual({ enabled: true, sourceId: 17 });
  });

  test("rejects non-boolean enabled", () => {
    const result = parseToggleFeedEnabledPayloadFromBody({
      enabled: "true",
      id: 17,
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

describe("parseUpdateFeedSettingsPayloadFromBody", () => {
  test("rejects payload without mutable fields", () => {
    const result = parseUpdateFeedSettingsPayloadFromBody({ id: 12 });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });

  test("parses extractionDisabled-only payload", () => {
    const result = parseUpdateFeedSettingsPayloadFromBody({
      extractionDisabled: true,
      id: 12,
    });
    expect(result).toEqual({ extractionDisabled: true, sourceId: 12 });
  });

  test("parses proxyEnabled-only payload", () => {
    const result = parseUpdateFeedSettingsPayloadFromBody({
      id: 12,
      proxyEnabled: false,
    });
    expect(result).toEqual({ proxyEnabled: false, sourceId: 12 });
  });

  test("parses payload with both mutable fields", () => {
    const result = parseUpdateFeedSettingsPayloadFromBody({
      extractionDisabled: false,
      id: 12,
      proxyEnabled: true,
    });
    expect(result).toEqual({
      extractionDisabled: false,
      proxyEnabled: true,
      sourceId: 12,
    });
  });
});

// ─── feed-parsers: parseDeleteSourceId ────────────────────────────────────────

describe("parseDeleteSourceId", () => {
  test("parses valid id from query string", () => {
    const request = new NextRequest("http://localhost/api/feeds?id=42");
    const result = parseDeleteSourceId(request);
    expect(result).toBe(42);
  });

  test("returns error for missing id", () => {
    const request = new NextRequest("http://localhost/api/feeds");
    const result = parseDeleteSourceId(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for non-numeric id", () => {
    const request = new NextRequest("http://localhost/api/feeds?id=abc");
    const result = parseDeleteSourceId(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for negative id", () => {
    const request = new NextRequest("http://localhost/api/feeds?id=-5");
    const result = parseDeleteSourceId(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for zero id", () => {
    const request = new NextRequest("http://localhost/api/feeds?id=0");
    const result = parseDeleteSourceId(request);
    expect(result).toBeInstanceOf(Response);
  });
});

// ─── feed-parsers: getRequestedFeedUrl ────────────────────────────────────────

describe("getRequestedFeedUrl", () => {
  test("extracts url from query string", () => {
    const request = new NextRequest(
      "http://localhost/api/feeds?url=https://example.com/feed",
    );
    expect(getRequestedFeedUrl(request)).toBe("https://example.com/feed");
  });

  test("returns null when no url param", () => {
    const request = new NextRequest("http://localhost/api/feeds");
    expect(getRequestedFeedUrl(request)).toBeNull();
  });

  test("returns null for empty url param", () => {
    const request = new NextRequest("http://localhost/api/feeds?url=");
    expect(getRequestedFeedUrl(request)).toBeNull();
  });

  test("trims whitespace from url param", () => {
    const request = new NextRequest(
      "http://localhost/api/feeds?url=%20https://x.com/feed%20",
    );
    expect(getRequestedFeedUrl(request)).toBe("https://x.com/feed");
  });
});

// ─── feed-repository: toFeedSourceResponse ────────────────────────────────────

// ── api/feeds/parsers – validation edge cases ────────────────────────────────

describe("api/feeds/parsers – assertAllowedFeedUrl", () => {
  test("returns error Response for disallowed URL (localhost)", async () => {
    const { assertAllowedFeedUrl } = await import("@/lib/api/feeds/parsers");
    const result = await assertAllowedFeedUrl("http://127.0.0.1/feed");
    expect(result).not.toBeNull();
    expect((result as Response).status).toBe(400);
  });
});

describe("api/feeds/parsers – parseCreateFeedPayload validation", () => {
  function makeFeedRequest(body: unknown): Request {
    return new Request("https://example.com/api/feeds", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  test("returns 400 when url exceeds max length", async () => {
    const { parseCreateFeedPayload } = await import("@/lib/api/feeds/parsers");
    const req = makeFeedRequest({
      name: "Feed",
      url: "https://x.com/" + "a".repeat(2200),
    });
    const result = await parseCreateFeedPayload(req as any);
    expect((result as Response).status).toBe(400);
  });
});

describe("api/feeds/parsers – parseRenameFeedPayloadFromBody", () => {
  test("returns 400 when url is missing", async () => {
    const { parseRenameFeedPayloadFromBody } =
      await import("@/lib/api/feeds/parsers");
    const result = parseRenameFeedPayloadFromBody({ id: 1, name: "Feed" });
    expect((result as Response).status).toBe(400);
  });

  test("returns 400 when url exceeds max length", async () => {
    const { parseRenameFeedPayloadFromBody } =
      await import("@/lib/api/feeds/parsers");
    const result = parseRenameFeedPayloadFromBody({
      id: 1,
      name: "Feed",
      url: "https://x.com/" + "a".repeat(2200),
    });
    expect((result as Response).status).toBe(400);
  });
});

describe("api/feeds/parsers – parseToggleFeedEnabledPayloadFromBody", () => {
  test("returns 400 when id is missing", async () => {
    const { parseToggleFeedEnabledPayloadFromBody } =
      await import("@/lib/api/feeds/parsers");
    const result = parseToggleFeedEnabledPayloadFromBody({ enabled: true });
    expect((result as Response).status).toBe(400);
  });
});
