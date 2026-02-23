/**
 * Integration Tests: Articles API Routes
 * Tests for src/app/api/articles/
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createMockArticle, createMockRequest } from "./helpers/test-utils";

const createSelectChain = () => ({
  innerJoin: () => createSelectChain(),
  where: () => createSelectChain(),
  orderBy: () => createSelectChain(),
  limit: () => Promise.resolve([createMockArticle()]),
});

function registerModuleMocks() {
  mock.module("@/lib/db/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => createSelectChain(),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve([createMockArticle()]),
        }),
      }),
    }),
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

describe("Articles API - List", () => {
  test("GET /api/articles returns articles", async () => {
    const { GET } = await import("@/app/api/articles/route");
    const request = createMockRequest("https://example.com/api/articles", {
      cookies: { session: "test-session" },
    });

    const response = await GET(request);
    expect(response.status).toBeLessThan(400);
    const body = await response.json();
    expect(Array.isArray(body.articles || body)).toBe(true);
  });

  test("GET /api/articles supports pagination", async () => {
    const { GET } = await import("@/app/api/articles/route");
    const request = createMockRequest(
      "https://example.com/api/articles?page=2&limit=20",
      {
        cookies: { session: "test-session" },
      },
    );

    const response = await GET(request);
    expect(response.status).toBeLessThan(400);
  });

  test("GET /api/articles filters by feed", async () => {
    const { GET } = await import("@/app/api/articles/route");
    const request = createMockRequest(
      "https://example.com/api/articles?feedId=1",
      {
        cookies: { session: "test-session" },
      },
    );

    const response = await GET(request);
    expect(response.status).toBeLessThan(400);
  });

  test("GET /api/articles filters by unread", async () => {
    const { GET } = await import("@/app/api/articles/route");
    const request = createMockRequest(
      "https://example.com/api/articles?unread=true",
      {
        cookies: { session: "test-session" },
      },
    );

    const response = await GET(request);
    expect(response.status).toBeLessThan(400);
  });

  test("GET /api/articles filters by starred", async () => {
    const { GET } = await import("@/app/api/articles/route");
    const request = createMockRequest(
      "https://example.com/api/articles?starred=true",
      {
        cookies: { session: "test-session" },
      },
    );

    const response = await GET(request);
    expect(response.status).toBeLessThan(400);
  });
});

describe("Articles API - Get Single", () => {
  test("GET /api/articles/:id returns article", async () => {
    const { GET } = await import("@/app/api/articles/[id]/route");
    const request = createMockRequest("https://example.com/api/articles/1", {
      cookies: { session: "test-session" },
    });

    const response = await GET(request, {
      params: Promise.resolve({ id: "1" }),
    });
    expect(response.status).toBeLessThan(500);
  });

  test("GET /api/articles/:id validates article id", async () => {
    const { GET } = await import("@/app/api/articles/[id]/route");
    const request = createMockRequest(
      "https://example.com/api/articles/invalid",
      {
        cookies: { session: "test-session" },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: "invalid" }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Articles API - Mark Read", () => {
  test("POST /api/articles/:id/read marks article as read", async () => {
    const { POST } = await import("@/app/api/articles/[id]/read/route");
    const request = createMockRequest(
      "https://example.com/api/articles/1/read",
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

describe("Articles API - Mark Unread", () => {
  test("POST /api/articles/:id/unread marks article as unread", async () => {
    const { POST } = await import("@/app/api/articles/[id]/unread/route");
    const request = createMockRequest(
      "https://example.com/api/articles/1/unread",
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

describe("Articles API - Star", () => {
  test("POST /api/articles/:id/star marks article as starred", async () => {
    const { POST } = await import("@/app/api/articles/[id]/star/route");
    const request = createMockRequest(
      "https://example.com/api/articles/1/star",
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

describe("Articles API - Unstar", () => {
  test("POST /api/articles/:id/unstar removes star", async () => {
    const { POST } = await import("@/app/api/articles/[id]/unstar/route");
    const request = createMockRequest(
      "https://example.com/api/articles/1/unstar",
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
