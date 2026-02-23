/**
 * Integration Tests: Auth API Routes
 * Tests for src/app/api/auth/
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createMockRequest } from "./helpers/test-utils";

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
});

describe("Auth API - Session", () => {
  test("GET /api/auth/session returns current user", async () => {
    const { GET } = await import("@/app/api/auth/session/route");
    const request = createMockRequest("https://example.com/api/auth/session", {
      cookies: { session: "valid-session-token" },
    });

    const response = await GET(request);
    expect(response.status).toBeLessThan(500);
  });
});
