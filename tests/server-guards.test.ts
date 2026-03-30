import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { resetRateLimiterForTesting } from "@/lib/server/rate-limit";

import { createMockRequest } from "./support/test-utils";

let guardsImportVersion = 0;

async function loadGuardsModule() {
  guardsImportVersion += 1;
  return import(`@/lib/server/guards?guards-test=${guardsImportVersion}`);
}

describe("server guards", () => {
  beforeEach(() => {
    resetRateLimiterForTesting();
  });

  afterEach(() => {
    resetRateLimiterForTesting();
  });

  test("logAndRespondError returns the default 500 response", async () => {
    const { logAndRespondError } = await loadGuardsModule();

    const response = logAndRespondError("Guard failure", new Error("boom"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
    });
  });

  test("logAndRespondError respects custom public message and status", async () => {
    const { logAndRespondError } = await loadGuardsModule();

    const response = logAndRespondError("Guard failure", new Error("boom"), {
      publicMessage: "Nope",
      status: 418,
    });

    expect(response.status).toBe(418);
    await expect(response.json()).resolves.toEqual({ error: "Nope" });
  });

  test("requireAuthenticatedUser returns the placeholder admin when no database is configured", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const { requireAuthenticatedUser } = await loadGuardsModule();
      const user = await requireAuthenticatedUser(
        createMockRequest("https://example.com/api/auth/session"),
      );

      expect(user).not.toBeInstanceOf(Response);
      if (!(user instanceof Response)) {
        expect(user.email).toBe("admin@admin.com");
        expect(user.userId).toBe(0);
      }
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  test("requireAuthenticatedUser returns 401 when the request has no authenticated user", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://example";

    try {
      const { requireAuthenticatedUser } = await loadGuardsModule();
      const response = await requireAuthenticatedUser(
        createMockRequest("https://example.com/api/auth/session"),
      );

      expect(response).toBeInstanceOf(Response);
      if (response instanceof Response) {
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
      }
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  test("requireMutableRequest rejects CSRF-unsafe requests before rate limiting", async () => {
    const { requireMutableRequest } = await loadGuardsModule();

    const response = requireMutableRequest(
      createMockRequest("https://example.com/api/feeds", {
        method: "POST",
      }),
      {
        rateLimit: {
          key: "feeds",
          maxAttempts: 1,
          windowMs: 60_000,
        },
      },
    );

    expect(response).toBeInstanceOf(Response);
    if (response instanceof Response) {
      expect(response.status).toBe(403);
    }
  });

  test("requireMutableRequest enforces request-scoped rate limits", async () => {
    const { requireMutableRequest } = await loadGuardsModule();
    const request = createMockRequest("https://example.com/api/feeds", {
      headers: {
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "203.0.113.41, 198.51.100.2",
      },
      method: "POST",
    });
    const options = {
      rateLimit: {
        key: "feeds",
        maxAttempts: 1,
        windowMs: 60_000,
      },
    } as const;

    expect(requireMutableRequest(request, options)).toBeNull();

    const rateLimitedResponse = requireMutableRequest(request, options);
    expect(rateLimitedResponse).toBeInstanceOf(Response);
    if (rateLimitedResponse instanceof Response) {
      expect(rateLimitedResponse.status).toBe(429);
    }
  });

  test("requireMutableAuthenticatedUser enforces user-scoped rate limits after auth", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const { requireMutableAuthenticatedUser } = await loadGuardsModule();
      const request = createMockRequest("https://example.com/api/feeds", {
        headers: {
          "sec-fetch-site": "same-origin",
          "x-forwarded-for": "203.0.113.55, 198.51.100.2",
        },
        method: "POST",
      });
      const options = {
        rateLimit: {
          key: "feeds",
          maxAttempts: 1,
          scope: "user" as const,
          windowMs: 60_000,
        },
      };

      const firstResult = await requireMutableAuthenticatedUser(request, options);
      expect(firstResult).not.toBeInstanceOf(Response);

      const secondResult = await requireMutableAuthenticatedUser(request, options);
      expect(secondResult).toBeInstanceOf(Response);
      if (secondResult instanceof Response) {
        expect(secondResult.status).toBe(429);
      }
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  test("requireMutableAuthenticatedUser returns 401 when auth fails in non-placeholder mode", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://example";

    try {
      const { requireMutableAuthenticatedUser } = await loadGuardsModule();
      const response = await requireMutableAuthenticatedUser(
        createMockRequest("https://example.com/api/feeds", {
          headers: {
            "sec-fetch-site": "same-origin",
            "x-forwarded-for": "203.0.113.57, 198.51.100.2",
          },
          method: "POST",
        }),
        {
          rateLimit: {
            key: "feeds",
            maxAttempts: 1,
            scope: "user",
            windowMs: 60_000,
          },
        },
      );

      expect(response).toBeInstanceOf(Response);
      if (response instanceof Response) {
        expect(response.status).toBe(401);
      }
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  test("requireMutableUserAndJsonBody returns the authenticated user and parsed object body", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const { requireMutableUserAndJsonBody } = await loadGuardsModule();
      const result = await requireMutableUserAndJsonBody(
        createMockRequest("https://example.com/api/feeds", {
          body: { feedUrl: "https://example.com/feed.xml" },
          headers: {
            "sec-fetch-site": "same-origin",
            "x-forwarded-for": "203.0.113.56, 198.51.100.2",
          },
          method: "POST",
        }),
      );

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(result.body).toEqual({ feedUrl: "https://example.com/feed.xml" });
        expect(result.user.email).toBe("admin@admin.com");
        expect(result.user.userId).toBe(0);
      }
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });

  test("requireMutableUserAndJsonBody rejects non-object JSON bodies", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const { requireMutableUserAndJsonBody } = await loadGuardsModule();
      const response = await requireMutableUserAndJsonBody(
        createMockRequest("https://example.com/api/feeds", {
          body: ["feed-url"],
          headers: {
            "sec-fetch-site": "same-origin",
            "x-forwarded-for": "203.0.113.58, 198.51.100.2",
          },
          method: "POST",
        }),
      );

      expect(response).toBeInstanceOf(Response);
      if (response instanceof Response) {
        expect(response.status).toBe(400);
      }
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
