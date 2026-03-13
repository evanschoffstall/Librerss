/**
 * Integration Tests: Articles API Routes
 * Tests for src/app/api/articles/
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

import { createMockArticle, createMockRequest } from "./support/test-utils";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

const mockState = {
  insertResult: [createMockArticle()],
  selectResult: [createMockArticle()],
};

const createSelectChain = () => ({
  innerJoin: () => createSelectChain(),
  limit: () => Promise.resolve(mockState.selectResult),
  orderBy: () => createSelectChain(),
  where: () => createSelectChain(),
});

function registerModuleMocks() {
  mock.module("@/lib/db/db", () => ({
    getDb: () => ({
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve(mockState.insertResult),
        }),
      }),
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
}

const authenticatedUser = {
  email: "test@example.com",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  sessionId: 1,
  userId: 1,
};

const articleRouteDeps = {
  requireAuthenticatedUserFn: async () => authenticatedUser,
  requireMutableAuthenticatedUserFn: async () => authenticatedUser,
};

const articleByIdRouteDeps = {
  requireAuthenticatedUserFn: async () => authenticatedUser,
};

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

    const response = await GET(request, articleRouteDeps);
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

    const response = await GET(request, articleRouteDeps);
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

    const response = await GET(request, articleRouteDeps);
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

    const response = await GET(request, articleRouteDeps);
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

    const response = await GET(request, articleRouteDeps);
    expect(response.status).toBeLessThan(400);
  });

  test("GET /api/articles returns empty list in placeholder mode", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const { GET } = await import("@/app/api/articles/route");
      const request = createMockRequest("https://example.com/api/articles", {
        cookies: { session: "test-session" },
      });

      const response = await GET(request, articleRouteDeps);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual([]);
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });
});

describe("Articles API - Create", () => {
  test("POST /api/articles validates title", async () => {
    const { POST } = await import("@/app/api/articles/route");
    const request = createMockRequest("https://example.com/api/articles", {
      body: {
        feed_id: 1,
        link: "https://example.com/article",
        title: "",
      },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });

    const response = await POST(request, articleRouteDeps);
    expect(response.status).toBe(400);
  });

  test("POST /api/articles validates link and feed_id", async () => {
    const { POST } = await import("@/app/api/articles/route");

    const badLinkRequest = createMockRequest(
      "https://example.com/api/articles",
      {
        body: {
          feed_id: 1,
          link: "not-a-url",
          title: "Title",
        },
        cookies: { session: "test-session" },
        headers: { "sec-fetch-site": "same-origin" },
        method: "POST",
      },
    );
    const badLinkResponse = await POST(badLinkRequest, articleRouteDeps);
    expect(badLinkResponse.status).toBe(400);

    const badFeedIdRequest = createMockRequest(
      "https://example.com/api/articles",
      {
        body: {
          feed_id: 0,
          link: "https://example.com/article",
          title: "Title",
        },
        cookies: { session: "test-session" },
        headers: { "sec-fetch-site": "same-origin" },
        method: "POST",
      },
    );
    const badFeedIdResponse = await POST(badFeedIdRequest, articleRouteDeps);
    expect(badFeedIdResponse.status).toBe(400);
  });

  test("POST /api/articles validates date inputs", async () => {
    const { POST } = await import("@/app/api/articles/route");
    const request = createMockRequest("https://example.com/api/articles", {
      body: {
        feed_id: 1,
        link: "https://example.com/article",
        publication_date: "not-a-date",
        title: "Title",
      },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });

    const response = await POST(request, articleRouteDeps);
    expect(response.status).toBe(400);
  });

  test("POST /api/articles rejects non-public article links", async () => {
    const { POST } = await import("@/app/api/articles/route");
    const request = createMockRequest("https://example.com/api/articles", {
      body: {
        feed_id: 1,
        link: "http://localhost/internal",
        title: "Title",
      },
      cookies: { session: "test-session" },
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });

    const response = await POST(request, articleRouteDeps);
    expect(response.status).toBe(400);
  });

  test("POST /api/articles rejects feeds not owned by the authenticated user", async () => {
    const previousSelect = mockState.selectResult;
    mockState.selectResult = [];

    try {
      const { POST } = await import("@/app/api/articles/route");
      const request = createMockRequest("https://example.com/api/articles", {
        body: {
          feed_id: 999,
          link: "https://example.com/article",
          title: "Title",
        },
        cookies: { session: "test-session" },
        headers: { "sec-fetch-site": "same-origin" },
        method: "POST",
      });

      const response = await POST(request, articleRouteDeps);
      expect(response.status).toBe(403);
    } finally {
      mockState.selectResult = previousSelect;
    }
  });

  test("POST /api/articles creates and returns a sanitized article", async () => {
    const previousSelect = mockState.selectResult;
    const previousInsert = mockState.insertResult;

    mockState.selectResult = [{ id: 1 }] as any;
    mockState.insertResult = [
      {
        ...createMockArticle(),
        content: "<p>safe</p>",
        link: "https://example.com/article",
        title: "Safe Title",
      },
    ];

    try {
      const { POST } = await import("@/app/api/articles/route");
      const request = createMockRequest("https://example.com/api/articles", {
        body: {
          content: "<script>alert(1)</script><p>safe</p>",
          feed_id: 1,
          last_checked: "2024-01-01T01:00:00.000Z",
          link: "https://example.com/article",
          publication_date: "2024-01-01T00:00:00.000Z",
          title: " <b>Safe Title</b> ",
        },
        cookies: { session: "test-session" },
        headers: { "sec-fetch-site": "same-origin" },
        method: "POST",
      });

      const response = await POST(request, articleRouteDeps);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.link).toBe("https://example.com/article");
    } finally {
      mockState.selectResult = previousSelect;
      mockState.insertResult = previousInsert;
    }
  });
});

describe("Articles API - Get Single", () => {
  test("GET /api/articles/:id returns article", async () => {
    const { GET } = await import("@/app/api/articles/[id]/route");
    const request = createMockRequest("https://example.com/api/articles/1", {
      cookies: { session: "test-session" },
    });

    const response = await GET(
      request,
      {
        params: Promise.resolve({ id: "1" }),
      },
      articleByIdRouteDeps,
    );
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

    const response = await GET(
      request,
      {
        params: Promise.resolve({ id: "invalid" }),
      },
      articleByIdRouteDeps,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
