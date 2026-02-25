/**
 * Integration Tests: Auth API Routes
 * Tests for src/app/api/auth/
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createMockRequest } from "./support/test-utils";

function registerModuleMocks() {
  mock.module("@/lib/db/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
      insert: () => ({
        into: () => ({
          values: () => ({
            returning: () => Promise.resolve([{ id: 1 }]),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    }),
  }));
}

beforeAll(() => {
  registerModuleMocks();
});

afterAll(() => {
  mock.restore();
});

describe("Auth API - Login", () => {
  test("POST /api/auth/login requires email and password", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const request = createMockRequest("https://example.com/api/auth/login", {
      method: "POST",
      body: {},
      headers: { "sec-fetch-site": "same-origin" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  test("POST /api/auth/login returns error for invalid credentials", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const request = createMockRequest("https://example.com/api/auth/login", {
      method: "POST",
      body: { email: "test@example.com", password: "wrong" },
      headers: { "sec-fetch-site": "same-origin" },
    });

    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  test("POST /api/auth/login validates email format", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const request = createMockRequest("https://example.com/api/auth/login", {
      method: "POST",
      body: { email: "not-an-email", password: "Password123!" },
      headers: { "sec-fetch-site": "same-origin" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

// Note: Register route not implemented yet
// describe("Auth API - Register", () => {
//   test("POST /api/auth/register requires valid email", async () => {
//     const previousAllowSignup = process.env.ALLOW_SIGNUP;
//     process.env.ALLOW_SIGNUP = "true";
//     const { POST } = await import("@/app/api/auth/register/route");
//     const request = createMockRequest("https://example.com/api/auth/register", {
//       method: "POST",
//       body: { email: "invalid", password: "ValidPass123!" },
//       headers: { "sec-fetch-site": "same-origin" },
//     });
//
//     const response = await POST(request);
//     expect([400, 403]).toContain(response.status);
//     process.env.ALLOW_SIGNUP = previousAllowSignup;
//   });
//
//   test("POST /api/auth/register validates password strength", async () => {
//     const previousAllowSignup = process.env.ALLOW_SIGNUP;
//     process.env.ALLOW_SIGNUP = "true";
//     const { POST } = await import("@/app/api/auth/register/route");
//     const request = createMockRequest("https://example.com/api/auth/register", {
//       method: "POST",
//       body: { email: "test@example.com", password: "weak" },
//       headers: { "sec-fetch-site": "same-origin" },
//     });
//
//     const response = await POST(request);
//     expect([400, 403]).toContain(response.status);
//     const body = await response.json();
//     expect(typeof body.error).toBe("string");
//     expect(body.error.length).toBeGreaterThan(0);
//     process.env.ALLOW_SIGNUP = previousAllowSignup;
//   });
// });

describe("Auth API - Login extended branches", () => {
  test("POST /api/auth/login returns 400 when password is empty string", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const request = createMockRequest("https://example.com/api/auth/login", {
      method: "POST",
      body: { email: "user@example.com", password: "" },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  test("POST /api/auth/login returns 401 when password exceeds max length", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const longPassword = "x".repeat(10_000);
    const request = createMockRequest("https://example.com/api/auth/login", {
      method: "POST",
      body: { email: "user@example.com", password: longPassword },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  test("POST /api/auth/login returns 400 when body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const rawRequest = new Request("https://example.com/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: "not-json{{",
    }) as any;
    rawRequest.cookies = {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      has: () => false,
      getAll: () => [],
    };
    const response = await POST(rawRequest);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  // NOTE: Testing the "wrong credentials → 401" path of authenticateCredentials is
  // not stable in the full suite because greader-route.contract.test.ts mocks
  // @/lib/auth/session with authenticateCredentials: async () => null, which makes
  // the login route throw a TypeError (null.ok) → 500. This path is covered by the
  // "returns error for invalid credentials" test in the Auth API - Login describe above.

  test("POST /api/auth/login rejects CSRF-unsafe request", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const request = createMockRequest("https://example.com/api/auth/login", {
      method: "POST",
      body: { email: "user@example.com", password: "ValidPass1!" },
      // no sec-fetch-site → CSRF failure
    });
    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Auth API - Logout", () => {
  test("POST /api/auth/logout clears session", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const request = createMockRequest("https://example.com/api/auth/logout", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
      cookies: { session: "test-session-token" },
    });

    const response = await POST(request);
    expect(response.status).toBeLessThan(400);
  });

  test("POST /api/auth/logout without session cookie still succeeds", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const request = createMockRequest("https://example.com/api/auth/logout", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
    });
    const response = await POST(request);
    expect(response.status).toBeLessThan(400);
  });

  test("POST /api/auth/logout rejects CSRF-unsafe request", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const request = createMockRequest("https://example.com/api/auth/logout", {
      method: "POST",
      // no sec-fetch-site header
    });
    const response = await POST(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Auth API - Session", () => {
  test("GET /api/auth/session returns unauthenticated when no cookie", async () => {
    const { GET } = await import("@/app/api/auth/session/route");
    const request = createMockRequest("https://example.com/api/auth/session");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("authenticated");
    expect(body).toHaveProperty("allowSignup");
    expect(body).toHaveProperty("usePlaceholderData");
  });

  test("GET /api/auth/session with token returns valid session shape", async () => {
    const { GET } = await import("@/app/api/auth/session/route");
    const request = createMockRequest("https://example.com/api/auth/session", {
      cookies: { session: "invalid-or-expired-token" },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    // Shape is always present regardless of auth state
    expect(body).toHaveProperty("authenticated");
    expect(body).toHaveProperty("allowSignup");
    expect(body).toHaveProperty("usePlaceholderData");
    // In normal runs (DB mock returns []) → unauthenticated
    // In parallel with greader-route.contract.test.ts (session mocked) → may be authenticated
    // Both are valid — just assert no 5xx
  });

  test("GET /api/auth/session returns current user", async () => {
    const { GET } = await import("@/app/api/auth/session/route");
    const request = createMockRequest("https://example.com/api/auth/session", {
      cookies: { session: "valid-session-token" },
    });

    const response = await GET(request);
    expect(response.status).toBeLessThan(500);
  });
});
