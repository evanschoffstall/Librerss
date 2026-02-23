/**
 * Integration Tests: Feeds API Routes
 * Tests for src/app/api/feeds/
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createMockFeed, createMockRequest } from "./helpers/test-utils";

const createSelectChain = () => ({
  leftJoin: () => createSelectChain(),
  where: () => createSelectChain(),
  orderBy: () => createSelectChain(),
  limit: () => Promise.resolve([createMockFeed()]),
});

function registerModuleMocks() {
  mock.module("@/lib/db/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => createSelectChain(),
      }),
      insert: () => ({
        into: () => ({
          values: () => ({
            returning: () => Promise.resolve([createMockFeed()]),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve([createMockFeed()]),
        }),
      }),
      delete: () => ({
        from: () => ({
          where: () => Promise.resolve({ rowCount: 1 }),
        }),
      }),
    }),
  }));

  mock.module("@/app/api/feeds/feed-get", () => ({
    handleFeedRead: async () => Response.json([]),
  }));

  mock.module("@/lib/api/route-helpers", () => ({
    requireAuthenticatedUser: async () => ({
      userId: 1,
      email: "test@example.com",
    }),
    requireMutableAuthenticatedUser: async () => ({
      userId: 1,
      email: "test@example.com",
    }),
    requireMutableRequest: () => null,
    logAndRespondError: (
      _message: string,
      _error: unknown,
      options?: { status?: number; publicMessage?: string },
    ) =>
      Response.json(
        { error: options?.publicMessage ?? "Internal Server Error" },
        { status: options?.status ?? 500 },
      ),
  }));
}

beforeAll(() => {
  registerModuleMocks();
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

    const response = await GET(request);
    expect(response.status).toBeLessThan(400);
    const body = await response.json();
    expect(body).toEqual([]);
  });
});

describe("Feeds API - Add", () => {
  test("POST /api/feeds requires url", async () => {
    const { POST } = await import("@/app/api/feeds/route");
    const request = createMockRequest("https://example.com/api/feeds", {
      method: "POST",
      body: {},
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  test("POST /api/feeds validates url format", async () => {
    const { POST } = await import("@/app/api/feeds/route");
    const request = createMockRequest("https://example.com/api/feeds", {
      method: "POST",
      body: { url: "not-a-valid-url" },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
    });

    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  test("POST /api/feeds accepts valid feed url", async () => {
    const { POST } = await import("@/app/api/feeds/route");
    const request = createMockRequest("https://example.com/api/feeds", {
      method: "POST",
      body: { url: "https://example.com/feed.xml" },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
    });

    const response = await POST(request);
    expect(response.status).toBeLessThan(500);
  });
});

describe("Feeds API - Update", () => {
  test("PATCH /api/feeds/:id updates feed", async () => {
    const { PATCH } = await import("@/app/api/feeds/[id]/route");
    const request = createMockRequest("https://example.com/api/feeds/1", {
      method: "PATCH",
      body: { title: "Updated Title" },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
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
      method: "DELETE",
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "1" }),
    });
    expect(response.status).toBeLessThan(500);
  });
});

describe("Feeds API - Refresh", () => {
  test("POST /api/feeds/:id/refresh triggers feed update", async () => {
    const { POST } = await import("@/app/api/feeds/[id]/refresh/route");
    const request = createMockRequest(
      "https://example.com/api/feeds/1/refresh",
      {
        method: "POST",
        cookies: { session: "test-session" },
        headers: { "sec-fetch-site": "same-origin" },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "1" }),
    });
    expect(response.status).toBeLessThan(500);
  });
});
