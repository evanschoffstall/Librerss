import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type SessionRow = { id: number };
type UserRow = { id: number; email: string; passwordHash: string };
type ActiveSessionRow = {
  sessionId: number;
  userId: number;
  email: string;
  expiresAt: Date;
};

const originalDbUrl = process.env.DATABASE_URL;

function buildMockDb(state: {
  userSessions: SessionRow[];
  userRows: UserRow[];
  activeSessionRows: ActiveSessionRow[];
  deleteSessionCalls: number;
  deleteOldSessionCalls: number;
  insertedSessionCalls: number;
}) {
  const tx = {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          orderBy: mock(() => ({
            for: mock(async () => state.userSessions),
          })),
        })),
      })),
    })),
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
  };

  return {
    transaction: mock(async (callback: (arg: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
    delete: mock(() => ({
      where: mock(async () => {
        state.deleteSessionCalls += 1;
        return [];
      }),
    })),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(async () => state.userRows),
        })),
        innerJoin: mock(() => ({
          where: mock(() => ({
            limit: mock(async () => state.activeSessionRows),
          })),
        })),
      })),
    })),
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
      userSessions: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      userRows: [],
      activeSessionRows: [],
      deleteSessionCalls: 0,
      deleteOldSessionCalls: 0,
      insertedSessionCalls: 0,
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
      userSessions: [],
      userRows: [],
      activeSessionRows: [],
      deleteSessionCalls: 0,
      deleteOldSessionCalls: 0,
      insertedSessionCalls: 0,
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
      userSessions: [],
      userRows: [],
      activeSessionRows: [],
      deleteSessionCalls: 0,
      deleteOldSessionCalls: 0,
      insertedSessionCalls: 0,
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
      userSessions: [],
      userRows: [],
      activeSessionRows: [
        {
          sessionId: 22,
          userId: 7,
          email: "person@example.com",
          expiresAt,
        },
      ],
      deleteSessionCalls: 0,
      deleteOldSessionCalls: 0,
      insertedSessionCalls: 0,
    };

    const mockDb = buildMockDb(state);
    mock.module("@/lib/db/db", () => ({
      getDb: () => mockDb,
    }));

    const { SESSION_COOKIE_NAME, getUserFromRequest, getUserFromSessionToken } =
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
      userSessions: [],
      userRows: [] as UserRow[],
      activeSessionRows: [],
      deleteSessionCalls: 0,
      deleteOldSessionCalls: 0,
      insertedSessionCalls: 0,
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
        id: 9,
        email: "person@example.com",
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
