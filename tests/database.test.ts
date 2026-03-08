/**
 * Unit Tests: Database Layer
 * Tests for src/lib/db/
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

function resetDbGlobalState() {
  const dbGlobal = globalThis as unknown as {
    pool?: unknown;
    db?: unknown;
    hasLoggedInitialDbConnectionWarning?: boolean;
    hasRunInitialDbConnectivityCheck?: boolean;
  };
  delete dbGlobal.pool;
  delete dbGlobal.db;
  delete dbGlobal.hasLoggedInitialDbConnectionWarning;
  delete dbGlobal.hasRunInitialDbConnectivityCheck;
}

function restoreDbEnv(previousEnv: {
  DATABASE_URL?: string;
  DB_MAX_CONNECTIONS?: string;
  DB_IDLE_TIMEOUT_MS?: string;
  DB_EAGER_CONNECT_CHECK?: string;
}) {
  if (previousEnv.DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousEnv.DATABASE_URL;
  }

  if (previousEnv.DB_MAX_CONNECTIONS === undefined) {
    delete process.env.DB_MAX_CONNECTIONS;
  } else {
    process.env.DB_MAX_CONNECTIONS = previousEnv.DB_MAX_CONNECTIONS;
  }

  if (previousEnv.DB_IDLE_TIMEOUT_MS === undefined) {
    delete process.env.DB_IDLE_TIMEOUT_MS;
  } else {
    process.env.DB_IDLE_TIMEOUT_MS = previousEnv.DB_IDLE_TIMEOUT_MS;
  }

  if (previousEnv.DB_EAGER_CONNECT_CHECK === undefined) {
    delete process.env.DB_EAGER_CONNECT_CHECK;
  } else {
    process.env.DB_EAGER_CONNECT_CHECK = previousEnv.DB_EAGER_CONNECT_CHECK;
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

describe("schema", () => {
  test("schema exports users table", async () => {
    const { users } = await import("@/lib/db/schema");
    expect(users.id).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.passwordHash).toBeDefined();
  });

  test("schema exports feeds table", async () => {
    const { feeds } = await import("@/lib/db/schema");
    expect(feeds.id).toBeDefined();
    expect(feeds.url).toBeDefined();
    expect(feeds.lastFetched).toBeDefined();
  });

  test("schema exports articles table", async () => {
    const { articles } = await import("@/lib/db/schema");
    expect(articles.id).toBeDefined();
    expect(articles.link).toBeDefined();
    expect(articles.feedId).toBeDefined();
  });

  test("schema exports articleStatus table", async () => {
    const { articleStatus, articleStatuses } = await import("@/lib/db/schema");
    expect(articleStatus).toBe(articleStatuses);
  });

  test("schema exports categories table", async () => {
    const { categories, feedCategories } = await import("@/lib/db/schema");
    expect(categories).toBe(feedCategories);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe("db-helpers", () => {
  test("isUniqueConstraintError detects unique violations", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    const uniqueError = { code: "23505" } as any;
    const otherError = { code: "23503" } as any;

    expect(isUniqueConstraintError(uniqueError)).toBe(true);
    expect(isUniqueConstraintError(otherError)).toBe(false);
  });

  test("isForeignKeyError detects foreign key violations", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    const fkError = { code: "23503" } as any;
    const otherError = { code: "23505" } as any;

    expect(isForeignKeyError(fkError)).toBe(true);
    expect(isForeignKeyError(otherError)).toBe(false);
  });

  test("isUniqueConstraintError handles null error", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    expect(isUniqueConstraintError(null)).toBe(false);
  });

  test("isUniqueConstraintError handles undefined error", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    expect(isUniqueConstraintError(undefined)).toBe(false);
  });

  test("isUniqueConstraintError handles non-object error", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    expect(isUniqueConstraintError("error string")).toBe(false);
    expect(isUniqueConstraintError(123)).toBe(false);
  });

  test("isForeignKeyError handles null error", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    expect(isForeignKeyError(null)).toBe(false);
  });

  test("isForeignKeyError handles undefined error", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    expect(isForeignKeyError(undefined)).toBe(false);
  });

  test("isForeignKeyError handles non-object error", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    expect(isForeignKeyError("error string")).toBe(false);
    expect(isForeignKeyError(123)).toBe(false);
  });

  test("isUniqueConstraintError handles object without code", async () => {
    const { isUniqueConstraintError } = await import("@/lib/db/db");
    expect(isUniqueConstraintError({})).toBe(false);
  });

  test("isForeignKeyError handles object without code", async () => {
    const { isForeignKeyError } = await import("@/lib/db/db");
    expect(isForeignKeyError({})).toBe(false);
  });
});

describe("db initialization", () => {
  test("getDb throws when DATABASE_URL is missing", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
    };
    resetDbGlobalState();
    delete process.env.DATABASE_URL;

    mock.module("pg", () => ({
      Pool: class MockPool {},
    }));
    mock.module("drizzle-orm/node-postgres", () => ({
      drizzle: () => ({ mockedDb: true }),
    }));

    const { getDb } = await import(`@/lib/db/db?missing-url=${Date.now()}`);

    expect(() => getDb()).toThrow("Missing required environment variable");
    restoreDbEnv(previousEnv);
  });

  test("getDb uses parsed pool config and caches the db instance", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
    };
    resetDbGlobalState();
    process.env.DATABASE_URL = "postgres://example/test";
    process.env.DB_MAX_CONNECTIONS = "7";
    process.env.DB_IDLE_TIMEOUT_MS = "2500";
    process.env.DB_EAGER_CONNECT_CHECK = "false";

    let capturedPoolConfig: Record<string, unknown> | null = null;
    const queryMock = mock(async () => [{ ok: true }]);
    const drizzleMock = mock((pool: unknown) => ({ pool, tag: "db-instance" }));

    mock.module("pg", () => ({
      Pool: class MockPool {
        constructor(config: Record<string, unknown>) {
          capturedPoolConfig = config;
        }
        query = queryMock;
      },
    }));
    mock.module("drizzle-orm/node-postgres", () => ({
      drizzle: drizzleMock,
    }));

    const { getDb } = await import(`@/lib/db/db?pool-config=${Date.now()}`);

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(capturedPoolConfig).toBeDefined();
    if (capturedPoolConfig === null) {
      throw new Error("Pool config was not captured");
    }
    const normalizedPoolConfig = capturedPoolConfig as Record<string, unknown>;
    expect(normalizedPoolConfig.connectionString).toBe(
      "postgres://example/test",
    );
    expect(normalizedPoolConfig.max).toBe(7);
    expect(normalizedPoolConfig.idleTimeoutMillis).toBe(2500);
    expect(normalizedPoolConfig.allowExitOnIdle).toBe(true);
    expect(drizzleMock).toHaveBeenCalledTimes(1);
    expect(queryMock).not.toHaveBeenCalled();
    restoreDbEnv(previousEnv);
  });

  test("getDb falls back to default pool config on invalid env values", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
    };
    resetDbGlobalState();
    process.env.DATABASE_URL = "postgres://example/test";
    process.env.DB_MAX_CONNECTIONS = "not-a-number";
    process.env.DB_IDLE_TIMEOUT_MS = "-1";
    process.env.DB_EAGER_CONNECT_CHECK = "false";

    let capturedPoolConfig: Record<string, unknown> | null = null;

    mock.module("pg", () => ({
      Pool: class MockPool {
        constructor(config: Record<string, unknown>) {
          capturedPoolConfig = config;
        }
        query = mock(async () => [{ ok: true }]);
      },
    }));
    mock.module("drizzle-orm/node-postgres", () => ({
      drizzle: () => ({ mockedDb: true }),
    }));

    const { getDb } = await import(`@/lib/db/db?invalid-env=${Date.now()}`);
    void getDb();

    expect(capturedPoolConfig).toBeDefined();
    if (capturedPoolConfig === null) {
      throw new Error("Pool config was not captured");
    }
    const normalizedPoolConfig = capturedPoolConfig as Record<string, unknown>;
    expect(normalizedPoolConfig.connectionString).toBe(
      "postgres://example/test",
    );
    expect(normalizedPoolConfig.max).toBe(1);
    expect(normalizedPoolConfig.idleTimeoutMillis).toBe(1000);
    expect(normalizedPoolConfig.allowExitOnIdle).toBe(true);
    restoreDbEnv(previousEnv);
  });

  test("eager connectivity check logs warning only once", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
    };
    resetDbGlobalState();
    process.env.DATABASE_URL = "postgres://example/test";
    process.env.DB_MAX_CONNECTIONS = "1";
    process.env.DB_IDLE_TIMEOUT_MS = "1000";
    process.env.DB_EAGER_CONNECT_CHECK = "true";

    const warnMock = mock(() => {});
    const queryMock = mock(async () => {
      throw new Error("connect failed");
    });

    mock.module("@/lib/logger", () => ({
      logger: {
        warn: warnMock,
        info: mock(() => {}),
        error: mock(() => {}),
      },
    }));
    mock.module("pg", () => ({
      Pool: class MockPool {
        query = queryMock;
      },
    }));
    mock.module("drizzle-orm/node-postgres", () => ({
      drizzle: () => ({ mockedDb: true }),
    }));

    const { getDb } = await import(`@/lib/db/db?eager-check=${Date.now()}`);

    void getDb();
    // Allow queued catch handler to run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    void getDb();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledTimes(1);
    restoreDbEnv(previousEnv);
  });
});
