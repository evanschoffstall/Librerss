/**
 * Comprehensive Unit Tests: Server Guards
 * Tests for src/lib/server/guards.ts - covers all exported guard functions,
 * authentication/authorization edge cases, and request validation scenarios.
 *
 * Target: 95%+ coverage (from 59% baseline)
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { PLACEHOLDER_ADMIN_USER } from "@/lib/core/runtime";
import { logger } from "@/lib/logger";
import {
  logAndRespondError,
  rateLimiter,
  requireAuthenticatedUser,
  requireMutableAuthenticatedUser,
  requireMutableRequest,
  requireMutableUserAndJsonBody,
} from "@/lib/server";

/** Build a POST NextRequest that passes CSRF same-origin validation. */
const buildMutableRequest = () =>
  new NextRequest("http://localhost/api/test", {
    headers: { host: "localhost", origin: "http://localhost" },
    method: "POST",
  });

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

// ─── Test Utilities ──────────────────────────────────────────────────────────

function createMutableRequest(
  url = "http://localhost:3000/api/test",
  options: {
    additionalHeaders?: Record<string, string>;
    body?: unknown;
    cookies?: Record<string, string>;
  } = {},
): NextRequest {
  const parsedUrl = new URL(url);
  return createRequest(url, {
    body: options.body,
    cookies: options.cookies,
    headers: {
      host: parsedUrl.host,
      origin: parsedUrl.origin,
      ...options.additionalHeaders,
    },
    method: "POST",
  });
}

function createRequest(
  url: string,
  options: {
    body?: unknown;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    method?: string;
  } = {},
): NextRequest {
  const headers = new Headers(options.headers ?? {});

  // Build cookie header from cookies object
  if (options.cookies) {
    const cookieHeader = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
    headers.set("cookie", cookieHeader);
  }

  const requestInit = {
    headers,
    method: options.method ?? "GET",
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  };

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return new NextRequest(url, requestInit);
}

// ─── requireAuthenticatedUser ────────────────────────────────────────────────

describe("requireAuthenticatedUser", () => {
  test("returns placeholder user in placeholder mode", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const request = createRequest("http://localhost:3000/api/test");
      const result = await requireAuthenticatedUser(request);

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(result.userId).toBe(PLACEHOLDER_ADMIN_USER.id);
        expect(result.email).toBe(PLACEHOLDER_ADMIN_USER.email);
        expect(result.expiresAt).toBeInstanceOf(Date);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns 401 when no session cookie provided", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://localhost/test";

    try {
      const request = createRequest("http://localhost:3000/api/test");
      const result = await requireAuthenticatedUser(request);

      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response) {
        expect(result.status).toBe(401);
        const body = await result.json();
        expect(body.error).toBe("Unauthorized");
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns placeholder user even with invalid token in placeholder mode", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const request = createRequest("http://localhost:3000/api/test", {
        cookies: {
          [SESSION_COOKIE_NAME]: "invalid-token-12345",
        },
      });
      const result = await requireAuthenticatedUser(request);

      // In placeholder mode, authentication is bypassed entirely
      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(result.userId).toBe(PLACEHOLDER_ADMIN_USER.id);
        expect(result.email).toBe(PLACEHOLDER_ADMIN_USER.email);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns user when valid session token provided in placeholder mode", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const request = createRequest("http://localhost:3000/api/test", {
        cookies: {
          [SESSION_COOKIE_NAME]: PLACEHOLDER_ADMIN_USER.sessionToken,
        },
      });
      const result = await requireAuthenticatedUser(request);

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(result.userId).toBe(PLACEHOLDER_ADMIN_USER.id);
        expect(result.email).toBe(PLACEHOLDER_ADMIN_USER.email);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });
});

// ─── requireMutableRequest ───────────────────────────────────────────────────

describe("requireMutableRequest", () => {
  test("returns null for valid same-origin request without rate limiting", () => {
    const request = createMutableRequest();
    const result = requireMutableRequest(request);
    expect(result).toBeNull();
  });

  test("returns error when origin header missing", () => {
    const request = createRequest("http://localhost:3000/api/test", {
      headers: {
        host: "localhost:3000",
      },
      method: "POST",
    });
    const result = requireMutableRequest(request);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
  });

  test("returns error when origin does not match host", () => {
    const request = createRequest("http://localhost:3000/api/test", {
      headers: {
        host: "localhost:3000",
        origin: "http://evil.com",
      },
      method: "POST",
    });
    const result = requireMutableRequest(request);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
  });

  test("applies request-scoped rate limiting by default", () => {
    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = requireMutableRequest(request, {
        rateLimit: {
          key: "test-mutation",
          maxAttempts: 10,
          windowMs: 60_000,
        },
      });

      expect(result).toBeNull();
      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(checkMock).toHaveBeenCalledWith(
        request,
        "test-mutation",
        expect.objectContaining({
          maxAttempts: 10,
          windowMs: 60_000,
        }),
      );
    } finally {
      rateLimiter.check = originalCheck;
    }
  });

  test("applies request-scoped rate limiting when explicitly specified", () => {
    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = requireMutableRequest(request, {
        rateLimit: {
          key: "explicit-request-scope",
          maxAttempts: 5,
          scope: "request",
          windowMs: 30_000,
        },
      });

      expect(result).toBeNull();
      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(checkMock).toHaveBeenCalledWith(
        request,
        "explicit-request-scope",
        expect.objectContaining({
          maxAttempts: 5,
          windowMs: 30_000,
        }),
      );
    } finally {
      rateLimiter.check = originalCheck;
    }
  });

  test("does not apply rate limiting with user scope", () => {
    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = requireMutableRequest(request, {
        rateLimit: {
          key: "user-scoped",
          maxAttempts: 10,
          scope: "user",
          windowMs: 60_000,
        },
      });

      expect(result).toBeNull();
      expect(checkMock).toHaveBeenCalledTimes(0);
    } finally {
      rateLimiter.check = originalCheck;
    }
  });

  test("returns error when rate limit exceeded", () => {
    const originalCheck = rateLimiter.check;
    const errorResponse = new Response(
      JSON.stringify({ error: "Too Many Requests" }),
      { status: 429 },
    );
    const checkMock = mock(() => errorResponse);
    rateLimiter.check = checkMock as unknown as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = requireMutableRequest(request, {
        rateLimit: {
          key: "test-limit",
          maxAttempts: 1,
          windowMs: 60_000,
        },
      });

      expect(result).toBe(errorResponse);
      expect(checkMock).toHaveBeenCalledTimes(1);
    } finally {
      rateLimiter.check = originalCheck;
    }
  });

  test("returns null when no rate limit options provided", () => {
    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = requireMutableRequest(request);

      expect(result).toBeNull();
      expect(checkMock).toHaveBeenCalledTimes(0);
    } finally {
      rateLimiter.check = originalCheck;
    }
  });
});

// ─── requireMutableAuthenticatedUser ─────────────────────────────────────────

describe("requireMutableAuthenticatedUser", () => {
  test("returns error when CSRF check fails", async () => {
    const request = createRequest("http://localhost:3000/api/test", {
      headers: {
        host: "localhost:3000",
        // Missing origin header
      },
      method: "POST",
    });
    const result = await requireMutableAuthenticatedUser(request);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
  });

  test("returns 401 when user is not authenticated", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://localhost/test";

    try {
      const request = createMutableRequest();
      const result = await requireMutableAuthenticatedUser(request);

      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response) {
        expect(result.status).toBe(401);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns user for valid authenticated request in placeholder mode", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const request = createMutableRequest("http://localhost:3000/api/test", {
        cookies: {
          [SESSION_COOKIE_NAME]: PLACEHOLDER_ADMIN_USER.sessionToken,
        },
      });
      const result = await requireMutableAuthenticatedUser(request);

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(result.userId).toBe(PLACEHOLDER_ADMIN_USER.id);
        expect(result.email).toBe(PLACEHOLDER_ADMIN_USER.email);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("applies request-scoped rate limiting when scope is request", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = await requireMutableAuthenticatedUser(request, {
        rateLimit: {
          key: "test-request-scope",
          maxAttempts: 5,
          scope: "request",
          windowMs: 60_000,
        },
      });

      expect(result).not.toBeInstanceOf(Response);
      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(checkMock).toHaveBeenCalledWith(
        request,
        "test-request-scope",
        expect.objectContaining({
          maxAttempts: 5,
          windowMs: 60_000,
        }),
      );
    } finally {
      rateLimiter.check = originalCheck;
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("applies user-scoped rate limiting after authentication succeeds", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = await requireMutableAuthenticatedUser(request, {
        rateLimit: {
          key: "test-user-scope",
          maxAttempts: 10,
          scope: "user",
          windowMs: 60_000,
        },
      });

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(checkMock).toHaveBeenCalledTimes(1);
        expect(checkMock).toHaveBeenCalledWith(
          request,
          `test-user-scope:user:${result.userId}`,
          expect.objectContaining({
            maxAttempts: 10,
            windowMs: 60_000,
          }),
        );
      }
    } finally {
      rateLimiter.check = originalCheck;
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("does not apply user-scoped rate limiting when auth fails", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://localhost/test";

    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = await requireMutableAuthenticatedUser(request, {
        rateLimit: {
          key: "test-user-scope",
          maxAttempts: 10,
          scope: "user",
          windowMs: 60_000,
        },
      });

      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response) {
        expect(result.status).toBe(401);
      }
      // Rate limiting should not be checked if auth fails
      expect(checkMock).toHaveBeenCalledTimes(0);
    } finally {
      rateLimiter.check = originalCheck;
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns error when user-scoped rate limit exceeded", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    const originalCheck = rateLimiter.check;
    const errorResponse = new Response(
      JSON.stringify({ error: "Too Many Requests" }),
      { status: 429 },
    );
    const checkMock = mock(() => errorResponse);
    rateLimiter.check = checkMock as unknown as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = await requireMutableAuthenticatedUser(request, {
        rateLimit: {
          key: "test-limit",
          maxAttempts: 1,
          scope: "user",
          windowMs: 60_000,
        },
      });

      expect(result).toBe(errorResponse);
      expect(checkMock).toHaveBeenCalledTimes(1);
    } finally {
      rateLimiter.check = originalCheck;
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("defaults to request scope when scope not specified", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest();
      const result = await requireMutableAuthenticatedUser(request, {
        rateLimit: {
          key: "default-scope",
          maxAttempts: 5,
          windowMs: 60_000,
        },
      });

      expect(result).not.toBeInstanceOf(Response);
      // Should be called in requireMutableRequest with request scope
      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(checkMock).toHaveBeenCalledWith(
        request,
        "default-scope",
        expect.objectContaining({
          maxAttempts: 5,
          windowMs: 60_000,
        }),
      );
    } finally {
      rateLimiter.check = originalCheck;
      process.env.DATABASE_URL = previousDbUrl;
    }
  });
});

// ─── requireMutableUserAndJsonBody ───────────────────────────────────────────

describe("requireMutableUserAndJsonBody", () => {
  test("returns error when CSRF check fails", async () => {
    const request = createRequest("http://localhost:3000/api/test", {
      body: { test: "data" },
      headers: {
        host: "localhost:3000",
        // Missing origin header
      },
      method: "POST",
    });
    const result = await requireMutableUserAndJsonBody(request);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
  });

  test("returns 401 when user is not authenticated", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://localhost/test";

    try {
      const request = createMutableRequest("http://localhost:3000/api/test", {
        body: { test: "data" },
      });
      const result = await requireMutableUserAndJsonBody(request);

      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response) {
        expect(result.status).toBe(401);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns error when body is not valid JSON", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      // Create request with invalid JSON body
      const request = new NextRequest("http://localhost:3000/api/test", {
        body: "not valid json{",
        headers: {
          "content-type": "application/json",
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
        method: "POST",
      });

      const result = await requireMutableUserAndJsonBody(request);

      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response) {
        expect(result.status).toBe(400);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns error when body is null", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const request = createMutableRequest("http://localhost:3000/api/test", {
        body: null,
      });
      const result = await requireMutableUserAndJsonBody(request);

      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response) {
        expect(result.status).toBe(400);
        const body = await result.json();
        expect(body.error).toBe("JSON body must be an object");
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns error when body is an array", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const request = createMutableRequest("http://localhost:3000/api/test", {
        body: [1, 2, 3],
      });
      const result = await requireMutableUserAndJsonBody(request);

      expect(result).toBeInstanceOf(Response);
      if (result instanceof Response) {
        expect(result.status).toBe(400);
        const body = await result.json();
        expect(body.error).toBe("JSON body must be an object");
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns user and body for valid request", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const testBody = { action: "test", value: 42 };
      const request = createMutableRequest("http://localhost:3000/api/test", {
        body: testBody,
      });
      const result =
        await requireMutableUserAndJsonBody<typeof testBody>(request);

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(result.user.userId).toBe(PLACEHOLDER_ADMIN_USER.id);
        expect(result.user.email).toBe(PLACEHOLDER_ADMIN_USER.email);
        expect(result.body).toEqual(testBody);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("preserves body type information", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      interface RequestBody {
        feedId: number;
        tags?: string[];
        title: string;
      }

      const testBody: RequestBody = {
        feedId: 123,
        tags: ["tech", "news"],
        title: "Test Feed",
      };

      const request = createMutableRequest("http://localhost:3000/api/test", {
        body: testBody,
      });
      const result = await requireMutableUserAndJsonBody<RequestBody>(request);

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(result.body.feedId).toBe(123);
        expect(result.body.title).toBe("Test Feed");
        expect(result.body.tags).toEqual(["tech", "news"]);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("applies rate limiting options", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    const originalCheck = rateLimiter.check;
    const checkMock = mock(() => null);
    rateLimiter.check = checkMock as typeof rateLimiter.check;

    try {
      const request = createMutableRequest("http://localhost:3000/api/test", {
        body: { test: "data" },
      });
      const result = await requireMutableUserAndJsonBody(request, {
        rateLimit: {
          key: "test-with-body",
          maxAttempts: 3,
          scope: "user",
          windowMs: 30_000,
        },
      });

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(checkMock).toHaveBeenCalledTimes(1);
        expect(checkMock).toHaveBeenCalledWith(
          request,
          `test-with-body:user:${result.user.userId}`,
          expect.objectContaining({
            maxAttempts: 3,
            windowMs: 30_000,
          }),
        );
      }
    } finally {
      rateLimiter.check = originalCheck;
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("returns rate limit error before parsing body when rate limit exceeded", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    const originalCheck = rateLimiter.check;
    const errorResponse = new Response(
      JSON.stringify({ error: "Too Many Requests" }),
      { status: 429 },
    );
    const checkMock = mock(() => errorResponse);
    rateLimiter.check = checkMock as unknown as typeof rateLimiter.check;

    try {
      const request = createMutableRequest("http://localhost:3000/api/test", {
        body: { test: "data" },
      });
      const result = await requireMutableUserAndJsonBody(request, {
        rateLimit: {
          key: "test-exceeded",
          maxAttempts: 1,
          scope: "user",
          windowMs: 60_000,
        },
      });

      expect(result).toBe(errorResponse);
    } finally {
      rateLimiter.check = originalCheck;
      process.env.DATABASE_URL = previousDbUrl;
    }
  });
});

// ─── logAndRespondError ──────────────────────────────────────────────────────

describe("logAndRespondError", () => {
  test("logs error and returns 500 response with default message", async () => {
    const originalError = logger.error;
    const errorMock = mock(() => {});
    logger.error = errorMock as typeof logger.error;

    try {
      const testError = new Error("Database connection failed");
      const response = logAndRespondError("Failed to fetch data", testError);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error).toBe("Internal Server Error");

      expect(errorMock).toHaveBeenCalledTimes(1);
      expect(errorMock).toHaveBeenCalledWith("Failed to fetch data", {
        error: expect.objectContaining({
          message: "Database connection failed",
        }),
      });
    } finally {
      logger.error = originalError;
    }
  });

  test("returns custom status code", async () => {
    const originalError = logger.error;
    const errorMock = mock(() => {});
    logger.error = errorMock as typeof logger.error;

    try {
      const testError = new Error("Not found");
      const response = logAndRespondError("Resource not found", testError, {
        status: 404,
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Internal Server Error");
    } finally {
      logger.error = originalError;
    }
  });

  test("returns custom public message", async () => {
    const originalError = logger.error;
    const errorMock = mock(() => {});
    logger.error = errorMock as typeof logger.error;

    try {
      const testError = new Error("Sensitive internal error");
      const response = logAndRespondError("Operation failed", testError, {
        publicMessage: "Unable to complete request",
      });

      const body = await response.json();
      expect(body.error).toBe("Unable to complete request");
      expect(body.error).not.toContain("Sensitive");
    } finally {
      logger.error = originalError;
    }
  });

  test("returns custom status and public message", async () => {
    const originalError = logger.error;
    const errorMock = mock(() => {});
    logger.error = errorMock as typeof logger.error;

    try {
      const testError = new Error("Validation failed");
      const response = logAndRespondError("Invalid input", testError, {
        publicMessage: "The provided data is invalid",
        status: 422,
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error).toBe("The provided data is invalid");
    } finally {
      logger.error = originalError;
    }
  });

  test("handles non-Error objects", async () => {
    const originalError = logger.error;
    const errorMock = mock(() => {});
    logger.error = errorMock as typeof logger.error;

    try {
      const testError = "String error";
      const response = logAndRespondError("String error occurred", testError);

      expect(response.status).toBe(500);
      expect(errorMock).toHaveBeenCalledTimes(1);
      expect(errorMock).toHaveBeenCalledWith("String error occurred", {
        error: expect.objectContaining({
          message: "String error",
        }),
      });
    } finally {
      logger.error = originalError;
    }
  });

  test("handles null/undefined error", async () => {
    const originalError = logger.error;
    const errorMock = mock(() => {});
    logger.error = errorMock as typeof logger.error;

    try {
      const response = logAndRespondError("Unknown error", null);

      expect(response.status).toBe(500);
      expect(errorMock).toHaveBeenCalledTimes(1);
    } finally {
      logger.error = originalError;
    }
  });

  test("logs with complete error context", async () => {
    const originalError = logger.error;
    const errorMock = mock(() => {});
    logger.error = errorMock as typeof logger.error;

    try {
      const testError = new Error("Complex error");
      testError.stack = "Error: Complex error\n    at test.ts:123:45";

      logAndRespondError("Complex operation failed", testError, {
        publicMessage: "Service unavailable",
        status: 503,
      });

      expect(errorMock).toHaveBeenCalledWith("Complex operation failed", {
        error: expect.objectContaining({
          message: "Complex error",
          stack: expect.stringContaining("test.ts:123:45"),
        }),
      });
    } finally {
      logger.error = originalError;
    }
  });
});

// ── lib/server/csp – buildCspHeader ──────────────────────────────────────────

describe("lib/server/csp – buildCspHeader", () => {
  test("includes nonces in script-src and style-src", async () => {
    const { buildCspHeader } = await import("@/lib/server/csp");
    const csp = buildCspHeader("scriptnonce123", "stylenonce456");
    expect(csp).toContain("nonce-scriptnonce123");
    expect(csp).toContain("nonce-stylenonce456");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("contains all required directive names", async () => {
    const { buildCspHeader } = await import("@/lib/server/csp");
    const names = buildCspHeader("a", "b")
      .split("; ")
      .map((d) => d.split(" ")[0]);
    for (const name of [
      "default-src",
      "script-src",
      "style-src",
      "img-src",
      "object-src",
    ]) {
      expect(names).toContain(name);
    }
  });
});

describe("request guards rate-limit scope", () => {
  test("requireMutableRequest applies request-scoped key unchanged", () => {
    const originalCheck = rateLimiter.check;
    const check = mock(() => null);
    rateLimiter.check = check as unknown as typeof rateLimiter.check;

    try {
      const request = buildMutableRequest();
      const response = requireMutableRequest(request, {
        rateLimit: {
          key: "mutation",
          maxAttempts: 5,
          scope: "request",
          windowMs: 60_000,
        },
      });

      expect(response).toBeNull();
      expect(check).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledWith(
        request,
        "mutation",
        expect.objectContaining({ maxAttempts: 5, windowMs: 60_000 }),
      );
    } finally {
      rateLimiter.check = originalCheck;
    }
  });

  test("requireMutableAuthenticatedUser applies user-scoped limiting only after auth succeeds", async () => {
    const originalCheck = rateLimiter.check;
    const check = mock(() => null);
    rateLimiter.check = check as unknown as typeof rateLimiter.check;

    try {
      const request = buildMutableRequest();

      const result = await requireMutableAuthenticatedUser(request, {
        rateLimit: {
          key: "article-extract",
          maxAttempts: 5,
          scope: "user",
          windowMs: 60_000,
        },
      });

      if (result instanceof Response) {
        expect(result.status).toBe(401);
        expect(check).toHaveBeenCalledTimes(0);
        return;
      }

      expect(result).toEqual(
        expect.objectContaining({ userId: expect.any(Number) }),
      );
      expect(check).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledWith(
        request,
        `article-extract:user:${result.userId}`,
        expect.objectContaining({ maxAttempts: 5, windowMs: 60_000 }),
      );
    } finally {
      rateLimiter.check = originalCheck;
    }
  });
});
