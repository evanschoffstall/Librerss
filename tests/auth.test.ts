/**
 * Unit Tests: Authentication & Session
 * Tests for src/lib/auth/
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { NextResponse } from "next/server";

import { createMockRequest } from "./support/test-utils";

// ─── Session Management ───────────────────────────────────────────────────────

describe("session", () => {
  test("hashPassword creates v2 prefixed hash", async () => {
    const { hashPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("TestPass123!");
    expect(hash).toMatch(/^v2:[0-9a-f]+:[0-9a-f]+$/);
  });

  test("hashPassword creates unique hashes for same password", async () => {
    const { hashPassword } = await import("@/lib/auth/session");
    const password = "TestPass123!";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    // Hashes should differ due to unique salts
    expect(hash1).not.toBe(hash2);
  });

  test("verifyPassword validates correct password", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/session");
    const password = "TestPass123!";
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  test("verifyPassword rejects incorrect password", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("TestPass123!");
    expect(await verifyPassword("WrongPass123!", hash)).toBe(false);
  });

  test("verifyPassword handles legacy v1 hashes", async () => {
    const { verifyPassword } = await import("@/lib/auth/session");
    // This is a pre-computed v1 hash for testing backward compatibility
    // Real production code should only generate v2 hashes
    const legacyHash =
      "0123456789abcdef:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    // Should not throw - just verifies it can handle legacy format
    const result = await verifyPassword("testpass", legacyHash);
    expect(typeof result).toBe("boolean");
  });

  test("SESSION_COOKIE_NAME is defined", async () => {
    const { SESSION_COOKIE_NAME } = await import("@/lib/auth/session");
    expect(SESSION_COOKIE_NAME).toBe("librerss_session");
  });

  test("setSessionCookie and clearSessionCookie set expected cookie metadata", async () => {
    const { clearSessionCookie, SESSION_COOKIE_NAME, setSessionCookie } =
      await import("@/lib/auth/session");

    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, "token-123");

    const setCookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(setCookie?.value).toBe("token-123");

    clearSessionCookie(response);
    const clearedCookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(clearedCookie?.value).toBe("");
  });

  test("createSession placeholder mode returns deterministic placeholder token", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const { createSession } = await import("@/lib/auth/session");
      const { PLACEHOLDER_ADMIN_USER } = await import("@/lib/core/runtime");

      const token = await createSession(PLACEHOLDER_ADMIN_USER.id);
      expect(token).toBe(PLACEHOLDER_ADMIN_USER.sessionToken);

      await expect(createSession(999)).rejects.toThrow("Placeholder mode");
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("placeholder mode session helpers resolve and reject correctly", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const {
        deleteSessionByToken,
        getUserFromRequest,
        getUserFromSessionToken,
        SESSION_COOKIE_NAME,
      } = await import("@/lib/auth/session");
      const { PLACEHOLDER_ADMIN_USER } = await import("@/lib/core/runtime");

      expect(await getUserFromSessionToken("")).toBeNull();
      expect(await getUserFromSessionToken("wrong-token")).toBeNull();

      const user = await getUserFromSessionToken(
        PLACEHOLDER_ADMIN_USER.sessionToken,
      );
      expect(user?.email).toBe(PLACEHOLDER_ADMIN_USER.email);
      expect(user?.userId).toBe(PLACEHOLDER_ADMIN_USER.id);

      const requestWithCookie = createMockRequest("https://example.com/api", {
        cookies: { [SESSION_COOKIE_NAME]: PLACEHOLDER_ADMIN_USER.sessionToken },
      });
      const requestWithoutCookie = createMockRequest("https://example.com/api");

      expect((await getUserFromRequest(requestWithCookie as any))?.email).toBe(
        PLACEHOLDER_ADMIN_USER.email,
      );
      expect(await getUserFromRequest(requestWithoutCookie as any)).toBeNull();

      await expect(deleteSessionByToken("any-token")).resolves.toBeUndefined();
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });

  test("authenticateCredentials handles placeholder success and failure", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";

    try {
      const { authenticateCredentials } = await import("@/lib/auth/session");

      const unknownEmail = await authenticateCredentials(
        "nope@example.com",
        "x",
      );
      expect(unknownEmail.ok).toBe(false);

      const wrongPassword = await authenticateCredentials(
        "admin@admin.com",
        "wrong-password",
      );
      expect(wrongPassword.ok).toBe(false);

      const success = await authenticateCredentials("admin@admin.com", "admin");
      expect(success.ok).toBe(true);
      if (success.ok) {
        expect(success.email).toBe("admin@admin.com");
        expect(typeof success.token).toBe("string");
        expect(success.token.length).toBeGreaterThan(10);
      }
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });
});

// ─── CSRF Protection ──────────────────────────────────────────────────────────

describe("csrf", () => {
  test("requireSameOrigin allows same-origin requests", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        origin: "https://example.com",
      },
      method: "POST",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("requireSameOrigin blocks cross-origin requests", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const request = new Request("https://example.com/api/test", {
      headers: {
        origin: "https://evil.com",
      },
      method: "POST",
    });
    const result = requireSameOrigin(request);
    expect(result?.status).toBe(403);
  });

  test("requireSameOrigin allows safe methods", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const request = new Request("https://example.com/api/test", {
      headers: {
        origin: "https://evil.com",
      },
      method: "GET",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("requireSameOrigin checks Sec-Fetch-Site header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const sameOrigin = new Request("https://example.com/api/test", {
      headers: {
        "sec-fetch-site": "same-origin",
      },
      method: "POST",
    });
    const crossOrigin = new Request("https://example.com/api/test", {
      headers: {
        "sec-fetch-site": "cross-site",
      },
      method: "POST",
    });

    expect(requireSameOrigin(sameOrigin)).toBeNull();
    expect(requireSameOrigin(crossOrigin)?.status).toBe(403);
  });
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────

describe("rate-limit", () => {
  test("RateLimiter allows requests under limit", async () => {
    const { RateLimiter } = await import("@/lib/server/rate-limit");
    const limiter = new RateLimiter();

    try {
      const request = new Request("https://example.com/api/test");
      const config = { maxAttempts: 5, windowMs: 60_000 };

      // All these should pass
      expect(limiter.check(request, "test", config)).toBeNull();
      expect(limiter.check(request, "test", config)).toBeNull();
      expect(limiter.check(request, "test", config)).toBeNull();
    } finally {
      limiter.destroy();
    }
  });

  test("RateLimiter blocks requests over limit", async () => {
    const { RateLimiter } = await import("@/lib/server/rate-limit");
    const limiter = new RateLimiter();

    try {
      const request = new Request("https://example.com/api/test");
      const config = { maxAttempts: 2, windowMs: 60_000 };

      expect(limiter.check(request, "test", config)).toBeNull();
      expect(limiter.check(request, "test", config)).toBeNull();

      // This should be blocked
      const blocked = limiter.check(request, "test", config);
      expect(blocked?.status).toBe(429);
    } finally {
      limiter.destroy();
    }
  });

  test("RateLimiter uses client IP", async () => {
    const { RateLimiter } = await import("@/lib/server/rate-limit");
    const limiter = new RateLimiter();

    try {
      const config = { maxAttempts: 1, windowMs: 60_000 };

      const request1 = new Request("https://example.com/api/test", {
        headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
      });
      const request2 = new Request("https://example.com/api/test", {
        headers: { "x-forwarded-for": "192.168.1.2, 10.0.0.1" },
      });

      // Different IPs should be tracked separately
      expect(limiter.check(request1, "test", config)).toBeNull();
      expect(limiter.check(request2, "test", config)).toBeNull();
    } finally {
      limiter.destroy();
    }
  });

  test("RateLimiter resets after window", async () => {
    const { RateLimiter } = await import("@/lib/server/rate-limit");
    const limiter = new RateLimiter();

    try {
      const request = new Request("https://example.com/api/test");
      const config = { maxAttempts: 1, windowMs: 100 };

      expect(limiter.check(request, "test", config)).toBeNull();

      // Should be blocked immediately
      expect(limiter.check(request, "test", config)?.status).toBe(429);

      // Wait for window to reset (reduced for tests)
      await new Promise((resolve) => setTimeout(resolve, 110));

      // Should be allowed again
      expect(limiter.check(request, "test", config)).toBeNull();
    } finally {
      limiter.destroy();
    }
  });
});

interface ActiveSessionRow {
  email: string;
  expiresAt: Date;
  sessionId: number;
  userId: number;
}
interface SessionRow {
  id: number;
}
interface UserRow {
  email: string;
  id: number;
  passwordHash: string;
}

const originalDbUrl = process.env.DATABASE_URL;

function buildMockDb(state: {
  activeSessionRows: ActiveSessionRow[];
  deleteOldSessionCalls: number;
  deleteSessionCalls: number;
  insertedSessionCalls: number;
  userRows: UserRow[];
  userSessions: SessionRow[];
}) {
  const tx = {
    delete: mock(() => ({
      where: mock(async () => {
        state.deleteOldSessionCalls += 1;
        return [];
      }),
    })),
    insert: mock(() => ({
      values: mock(async () => {
        state.insertedSessionCalls += 1;
        return [];
      }),
    })),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          orderBy: mock(() => ({
            for: mock(async () => state.userSessions),
          })),
        })),
      })),
    })),
  };

  return {
    delete: mock(() => ({
      where: mock(async () => {
        state.deleteSessionCalls += 1;
        return [];
      }),
    })),
    select: mock(() => ({
      from: mock(() => ({
        innerJoin: mock(() => ({
          where: mock(() => ({
            limit: mock(async () => state.activeSessionRows),
          })),
        })),
        where: mock(() => ({
          limit: mock(async () => state.userRows),
        })),
      })),
    })),
    transaction: mock(async (callback: (arg: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
}

beforeEach(() => {
  mock.restore();
  process.env.DATABASE_URL = "postgres://local/test";
});

afterEach(() => {
  mock.restore();
  if (originalDbUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDbUrl;
  }
});

describe("session non-placeholder paths", () => {
  test("createSession enforces max sessions and inserts new session", async () => {
    const state = {
      activeSessionRows: [],
      deleteOldSessionCalls: 0,
      deleteSessionCalls: 0,
      insertedSessionCalls: 0,
      userRows: [],
      userSessions: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
    };

    const mockDb = buildMockDb(state);
    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    const { createSession } = await import("@/lib/auth/session");
    const token = await createSession(123);

    expect(typeof token).toBe("string");
    expect(token.length).toBe(64);
    expect(state.deleteOldSessionCalls).toBe(1);
    expect(state.insertedSessionCalls).toBe(1);
  });

  test("deleteSessionByToken executes delete query", async () => {
    const state = {
      activeSessionRows: [],
      deleteOldSessionCalls: 0,
      deleteSessionCalls: 0,
      insertedSessionCalls: 0,
      userRows: [],
      userSessions: [],
    };

    const mockDb = buildMockDb(state);
    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    const { deleteSessionByToken } = await import("@/lib/auth/session");
    await deleteSessionByToken("session-token");

    expect(state.deleteSessionCalls).toBe(1);
  });

  test("getUserFromSessionToken returns null for empty token and DB miss", async () => {
    const state = {
      activeSessionRows: [],
      deleteOldSessionCalls: 0,
      deleteSessionCalls: 0,
      insertedSessionCalls: 0,
      userRows: [],
      userSessions: [],
    };

    const mockDb = buildMockDb(state);
    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    const { getUserFromSessionToken } = await import("@/lib/auth/session");

    expect(await getUserFromSessionToken("")).toBeNull();
    expect(await getUserFromSessionToken("missing-token")).toBeNull();
  });

  test("getUserFromSessionToken and getUserFromRequest return active user", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const state = {
      activeSessionRows: [
        {
          email: "person@example.com",
          expiresAt,
          sessionId: 22,
          userId: 7,
        },
      ],
      deleteOldSessionCalls: 0,
      deleteSessionCalls: 0,
      insertedSessionCalls: 0,
      userRows: [],
      userSessions: [],
    };

    const mockDb = buildMockDb(state);
    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    const { getUserFromRequest, getUserFromSessionToken, SESSION_COOKIE_NAME } =
      await import("@/lib/auth/session");

    const fromToken = await getUserFromSessionToken("active-token");
    expect(fromToken?.userId).toBe(7);
    expect(fromToken?.email).toBe("person@example.com");

    const request = {
      cookies: {
        get: (name: string) =>
          name === SESSION_COOKIE_NAME ? { value: "active-token" } : undefined,
      },
    } as any;

    const fromRequest = await getUserFromRequest(request);
    expect(fromRequest?.sessionId).toBe(22);
  });

  test("authenticateCredentials handles missing user, wrong password, and success", async () => {
    const { PLACEHOLDER_ADMIN_USER } = await import("@/lib/core/runtime");

    const state = {
      activeSessionRows: [],
      deleteOldSessionCalls: 0,
      deleteSessionCalls: 0,
      insertedSessionCalls: 0,
      userRows: [] as UserRow[],
      userSessions: [],
    };

    const mockDb = buildMockDb(state as any);
    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    const { authenticateCredentials } = await import("@/lib/auth/session");

    state.userRows = [];
    const missingUser = await authenticateCredentials(
      "none@example.com",
      "GoodPass123!",
    );
    expect(missingUser.ok).toBe(false);

    state.userRows = [
      {
        email: "person@example.com",
        id: 9,
        passwordHash: PLACEHOLDER_ADMIN_USER.passwordHash,
      },
    ];
    const wrongPassword = await authenticateCredentials(
      "person@example.com",
      "WrongPass123!",
    );
    expect(wrongPassword.ok).toBe(false);

    const success = await authenticateCredentials(
      "person@example.com",
      "admin",
    );
    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.userId).toBe(9);
      expect(success.email).toBe("person@example.com");
      expect(typeof success.token).toBe("string");
      expect(success.token.length).toBe(64);
    }
  });
});
