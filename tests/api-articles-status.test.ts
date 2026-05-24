/**
 * Unit Tests: Article Status API Route
 * Tests for src/app/api/articles/status/route.ts
 *
 * Focuses on the article ownership check — invalid or unsubscribed article
 * IDs must return 404 rather than causing a DB FK-violation 500.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createMockArticle, createMockRequest } from "./support/test-utils";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// ── Shared dep injection helpers ──────────────────────────────────────────────

const authenticatedUser = {
  email: "test@example.com",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  isAdmin: false,
  sessionId: 1,
  userId: 42,
};

/** Returns a valid auth+body result for the given request body. */
function requireAuthOk(body: Record<string, unknown>) {
  return async () => ({ body, user: authenticatedUser });
}

/** Simulates `requireMutableUserAndJsonBody` returning an auth failure. */
const requireAuthFail = async () =>
  new Response("Unauthorized", { status: 401 });

/** No-op upsert that never touches the DB. */
const upsertNoop = async () => undefined;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/articles/status – input validation", () => {
  test("returns 400 when articleId is missing", async () => {
    const { POST } = await import("@/app/api/articles/status/route");
    const request = createMockRequest(
      "https://example.com/api/articles/status",
      {
        body: { isRead: true },
        method: "POST",
      },
    );

    const res = await POST(request, {
      getUserOwnedArticleByIdFn: async () => createMockArticle(),
      requireMutableUserAndJsonBodyFn: requireAuthOk({ isRead: true }),
      upsertArticleStatusesFn: upsertNoop,
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when neither isRead nor isStarred is provided", async () => {
    const { POST } = await import("@/app/api/articles/status/route");
    const request = createMockRequest(
      "https://example.com/api/articles/status",
      {
        body: { articleId: 1 },
        method: "POST",
      },
    );

    const res = await POST(request, {
      getUserOwnedArticleByIdFn: async () => createMockArticle(),
      requireMutableUserAndJsonBodyFn: requireAuthOk({ articleId: 1 }),
      upsertArticleStatusesFn: upsertNoop,
    });

    expect(res.status).toBe(400);
  });

  test("forwards auth failure from requireMutableUserAndJsonBody", async () => {
    const { POST } = await import("@/app/api/articles/status/route");
    const request = createMockRequest(
      "https://example.com/api/articles/status",
      {
        body: { articleId: 1, isRead: true },
        method: "POST",
      },
    );

    const res = await POST(request, {
      requireMutableUserAndJsonBodyFn: requireAuthFail,
    });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/articles/status – ownership check", () => {
  test("returns 404 when article does not exist or is not owned by user", async () => {
    const { POST } = await import("@/app/api/articles/status/route");
    const request = createMockRequest(
      "https://example.com/api/articles/status",
      {
        body: { articleId: 99999, isRead: true },
        method: "POST",
      },
    );

    let upsertCalled = false;
    const res = await POST(request, {
      // Simulate: article 99999 is not in any feed the user subscribes to.
      getUserOwnedArticleByIdFn: async () => null,
      requireMutableUserAndJsonBodyFn: requireAuthOk({
        articleId: 99999,
        isRead: true,
      }),
      upsertArticleStatusesFn: async () => {
        upsertCalled = true;
      },
    });

    expect(res.status).toBe(404);
    // Upsert must NOT be called when ownership check fails.
    expect(upsertCalled).toBe(false);
  });

  test("returns 200 and calls upsert when article is owned by user", async () => {
    const { POST } = await import("@/app/api/articles/status/route");
    const request = createMockRequest(
      "https://example.com/api/articles/status",
      {
        body: { articleId: 7, isRead: true },
        method: "POST",
      },
    );

    let upsertPayload: null | { articleIds: number[]; changes: object } = null;
    const res = await POST(request, {
      getUserOwnedArticleByIdFn: async (_db, _userId, articleId) =>
        createMockArticle({ id: articleId }),
      requireMutableUserAndJsonBodyFn: requireAuthOk({
        articleId: 7,
        isRead: true,
      }),
      upsertArticleStatusesFn: async (_userId, articleIds, changes) => {
        upsertPayload = { articleIds, changes };
      },
    });

    expect(res.status).toBe(200);
    expect(upsertPayload).not.toBeNull();
    expect(upsertPayload!.articleIds).toEqual([7]);
    expect(upsertPayload!.changes).toMatchObject({ isRead: true });
  });

  test("ownership check receives the authenticated user's userId", async () => {
    const { POST } = await import("@/app/api/articles/status/route");
    const request = createMockRequest(
      "https://example.com/api/articles/status",
      {
        body: { articleId: 5, isStarred: true },
        method: "POST",
      },
    );

    const capturedUserIds: number[] = [];
    await POST(request, {
      getUserOwnedArticleByIdFn: async (_db, userId, articleId) => {
        capturedUserIds.push(userId);
        return createMockArticle({ id: articleId });
      },
      requireMutableUserAndJsonBodyFn: requireAuthOk({
        articleId: 5,
        isStarred: true,
      }),
      upsertArticleStatusesFn: upsertNoop,
    });

    // The ownership check must use the authenticated user's ID, not arbitrary input.
    expect(capturedUserIds).toEqual([authenticatedUser.userId]);
  });

  test("returns a service error response when article status updates raise ServerServiceError", async () => {
    const { POST } = await import("@/app/api/articles/status/route");
    const { ServerServiceError } = await import("@/lib/server");
    const request = createMockRequest(
      "https://example.com/api/articles/status",
      {
        body: { articleId: 7, isRead: true },
        method: "POST",
      },
    );

    const response = await POST(request, {
      getUserOwnedArticleByIdFn: async (_db, _userId, articleId) =>
        createMockArticle({ id: articleId }),
      requireMutableUserAndJsonBodyFn: requireAuthOk({
        articleId: 7,
        isRead: true,
      }),
      upsertArticleStatusesFn: async () => {
        throw new ServerServiceError("custom failure", 409);
      },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "custom failure",
    });
  });

  test("returns a generic logged error response when article status updates raise an unexpected error", async () => {
    const { POST } = await import("@/app/api/articles/status/route");
    const request = createMockRequest(
      "https://example.com/api/articles/status",
      {
        body: { articleId: 7, isStarred: true },
        method: "POST",
      },
    );

    const response = await POST(request, {
      getUserOwnedArticleByIdFn: async (_db, _userId, articleId) =>
        createMockArticle({ id: articleId }),
      requireMutableUserAndJsonBodyFn: requireAuthOk({
        articleId: 7,
        isStarred: true,
      }),
      upsertArticleStatusesFn: async () => {
        throw new Error("unexpected failure");
      },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Internal Server Error",
    });
  });
});
