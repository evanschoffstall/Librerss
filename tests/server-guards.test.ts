/**
 * Comprehensive Unit Tests: Server Guards
 * Tests for src/lib/server/guards.ts - covers all exported guard functions,
 * authentication/authorization edge cases, and request validation scenarios.
 *
 * Target: 95%+ coverage (from 59% baseline)
 */

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
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

// ─── Test Utilities ──────────────────────────────────────────────────────────

function createRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    cookies?: Record<string, string>;
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
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  };

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return new NextRequest(url, requestInit);
}

function createMutableRequest(
  url: string = "http://localhost:3000/api/test",
  options: {
    body?: unknown;
    cookies?: Record<string, string>;
    additionalHeaders?: Record<string, string>;
  } = {},
): NextRequest {
  const parsedUrl = new URL(url);
  return createRequest(url, {
    method: "POST",
    headers: {
      host: parsedUrl.host,
      origin: parsedUrl.origin,
      ...options.additionalHeaders,
    },
    body: options.body,
    cookies: options.cookies,
  });
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
      method: "POST",
      headers: {
        host: "localhost:3000",
      },
    });
    const result = requireMutableRequest(request);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
  });

  test("returns error when origin does not match host", () => {
    const request = createRequest("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://evil.com",
      },
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
          windowMs: 60_000,
          maxAttempts: 10,
        },
      });

      expect(result).toBeNull();
      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(checkMock).toHaveBeenCalledWith(
        request,
        "test-mutation",
        expect.objectContaining({
          windowMs: 60_000,
          maxAttempts: 10,
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
          windowMs: 30_000,
          maxAttempts: 5,
          scope: "request",
        },
      });

      expect(result).toBeNull();
      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(checkMock).toHaveBeenCalledWith(
        request,
        "explicit-request-scope",
        expect.objectContaining({
          windowMs: 30_000,
          maxAttempts: 5,
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
          windowMs: 60_000,
          maxAttempts: 10,
          scope: "user",
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
          windowMs: 60_000,
          maxAttempts: 1,
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
      method: "POST",
      headers: {
        host: "localhost:3000",
        // Missing origin header
      },
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
          windowMs: 60_000,
          maxAttempts: 5,
          scope: "request",
        },
      });

      expect(result).not.toBeInstanceOf(Response);
      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(checkMock).toHaveBeenCalledWith(
        request,
        "test-request-scope",
        expect.objectContaining({
          windowMs: 60_000,
          maxAttempts: 5,
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
          windowMs: 60_000,
          maxAttempts: 10,
          scope: "user",
        },
      });

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(checkMock).toHaveBeenCalledTimes(1);
        expect(checkMock).toHaveBeenCalledWith(
          request,
          `test-user-scope:user:${result.userId}`,
          expect.objectContaining({
            windowMs: 60_000,
            maxAttempts: 10,
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
          windowMs: 60_000,
          maxAttempts: 10,
          scope: "user",
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
          windowMs: 60_000,
          maxAttempts: 1,
          scope: "user",
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
          windowMs: 60_000,
          maxAttempts: 5,
        },
      });

      expect(result).not.toBeInstanceOf(Response);
      // Should be called in requireMutableRequest with request scope
      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(checkMock).toHaveBeenCalledWith(
        request,
        "default-scope",
        expect.objectContaining({
          windowMs: 60_000,
          maxAttempts: 5,
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
      method: "POST",
      headers: {
        host: "localhost:3000",
        // Missing origin header
      },
      body: { test: "data" },
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
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: "not valid json{",
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
      type RequestBody = {
        feedId: number;
        title: string;
        tags?: string[];
      };

      const testBody: RequestBody = {
        feedId: 123,
        title: "Test Feed",
        tags: ["tech", "news"],
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
          windowMs: 30_000,
          maxAttempts: 3,
          scope: "user",
        },
      });

      expect(result).not.toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        expect(checkMock).toHaveBeenCalledTimes(1);
        expect(checkMock).toHaveBeenCalledWith(
          request,
          `test-with-body:user:${result.user.userId}`,
          expect.objectContaining({
            windowMs: 30_000,
            maxAttempts: 3,
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
          windowMs: 60_000,
          maxAttempts: 1,
          scope: "user",
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
        status: 422,
        publicMessage: "The provided data is invalid",
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
        status: 503,
        publicMessage: "Service unavailable",
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
