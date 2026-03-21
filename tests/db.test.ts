/**
 * Unit Tests: Database Layer
 * Tests for src/lib/db/
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Client, Pool } from "pg";

import type {
  resetDbDependenciesForTesting as resetDbDependenciesForTestingType,
  setDbDependenciesForTesting as setDbDependenciesForTestingType,
} from "@/lib/db/db";
import type {
  resetSqlQueryExecutorFactoryForTesting as resetSqlQueryExecutorFactoryForTestingType,
  setSqlQueryExecutorFactoryForTesting as setSqlQueryExecutorFactoryForTestingType,
} from "@/lib/db/query-executor";
import type { SqlQueryExecutor } from "@/lib/db/types";

// Static type anchors so knip can detect these exports are used. The actual
// calls go through cache-busted dynamic imports to ensure fresh module state.
type _KnipDbTestingSeamAnchors = [
  typeof resetDbDependenciesForTestingType,
  typeof setDbDependenciesForTestingType,
  typeof resetSqlQueryExecutorFactoryForTestingType,
  typeof setSqlQueryExecutorFactoryForTestingType,
];

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

function resetDbGlobalState() {
  const dbGlobal = globalThis as unknown as {
    db?: unknown;
    hasLoggedInitialDbConnectionWarning?: boolean;
    hasRunInitialDbConnectivityCheck?: boolean;
    pool?: unknown;
  };
  delete dbGlobal.pool;
  delete dbGlobal.db;
  delete dbGlobal.hasLoggedInitialDbConnectionWarning;
  delete dbGlobal.hasRunInitialDbConnectivityCheck;
}

function restoreDbEnv(previousEnv: {
  DATABASE_URL?: string;
  DB_DRIVER?: string;
  DB_EAGER_CONNECT_CHECK?: string;
  DB_IDLE_TIMEOUT_MS?: string;
  DB_MAX_CONNECTIONS?: string;
}) {
  if (previousEnv.DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousEnv.DATABASE_URL;
  }

  if (previousEnv.DB_DRIVER === undefined) {
    delete process.env.DB_DRIVER;
  } else {
    process.env.DB_DRIVER = previousEnv.DB_DRIVER;
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

describe("db-config", () => {
  test("normalizes ambiguous pg SSL aliases to verify-full", async () => {
    const connectionStringModule: typeof import("@/lib/db/connection-string") =
      await import(`@/lib/db/connection-string?normalize=${Date.now()}`);

    expect(
      connectionStringModule.normalizePostgresConnectionString(
        "postgresql://user:pass@example.com/db?sslmode=require&channel_binding=require",
      ),
    ).toBe(
      "postgresql://user:pass@example.com/db?sslmode=verify-full&channel_binding=require",
    );
    expect(
      connectionStringModule.normalizePostgresConnectionString(
        "postgres://user:pass@example.com/db?sslmode=verify-ca",
      ),
    ).toBe(
      "postgres://user:pass@example.com/db?sslmode=verify-full",
    );
  });

  test("preserves explicit libpq compatibility requests", async () => {
    const connectionStringModule: typeof import("@/lib/db/connection-string") =
      await import(`@/lib/db/connection-string?libpq=${Date.now()}`);

    expect(
      connectionStringModule.normalizePostgresConnectionString(
        "postgresql://user:pass@example.com/db?sslmode=require&uselibpqcompat=true",
      ),
    ).toBe(
      "postgresql://user:pass@example.com/db?sslmode=require&uselibpqcompat=true",
    );
      expect(
        connectionStringModule.normalizePostgresConnectionString(
          "postgresql://user:pass@example.com/db?sslmode=require&uselibpqcompat=on",
        ),
      ).toBe(
        "postgresql://user:pass@example.com/db?sslmode=require&uselibpqcompat=on",
      );
      expect(
        connectionStringModule.normalizePostgresConnectionString(
          "postgresql://user:pass@example.com/db?sslmode=require&uselibpqcompat=1",
        ),
      ).toBe(
        "postgresql://user:pass@example.com/db?sslmode=require&uselibpqcompat=1",
      );
    });

    test("leaves invalid, non-postgres, and unsupported sslmode strings untouched", async () => {
      const connectionStringModule: typeof import("@/lib/db/connection-string") =
        await import(`@/lib/db/connection-string?passthrough=${Date.now()}`);

      expect(
        connectionStringModule.normalizePostgresConnectionString("not-a-url"),
      ).toBe("not-a-url");
      expect(
        connectionStringModule.normalizePostgresConnectionString(
          "mysql://user:pass@example.com/db?sslmode=require",
        ),
      ).toBe("mysql://user:pass@example.com/db?sslmode=require");
      expect(
        connectionStringModule.normalizePostgresConnectionString(
          "postgresql://user:pass@example.com/db",
        ),
      ).toBe("postgresql://user:pass@example.com/db");
      expect(
        connectionStringModule.normalizePostgresConnectionString(
          "postgresql://user:pass@example.com/db?sslmode=disable",
        ),
      ).toBe("postgresql://user:pass@example.com/db?sslmode=disable");
  });

  test("parses connection and pool configuration from env", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };

    process.env.DATABASE_URL =
      "  postgres://example/config?sslmode=require&channel_binding=require  ";
    process.env.DB_DRIVER = "NeOn";
    process.env.DB_IDLE_TIMEOUT_MS = "2500";
    process.env.DB_MAX_CONNECTIONS = "7";
    process.env.DB_EAGER_CONNECT_CHECK = "true";

    const configModule: typeof import("@/lib/db/config") = await import(
      `@/lib/db/config?config-valid=${Date.now()}`
    );

    expect(configModule.getConnectionString()).toBe(
      "postgres://example/config?sslmode=verify-full&channel_binding=require",
    );
    expect(configModule.getDbDriver()).toBe("neon");
    expect(configModule.getDbIdleTimeoutMs()).toBe(2500);
    expect(configModule.getDbMaxConnections()).toBe(7);
    expect(configModule.shouldRunInitialDbConnectivityCheck()).toBe(true);

    restoreDbEnv(previousEnv);
  });

  test("falls back for invalid config env values and rejects invalid DB_DRIVER", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };

    delete process.env.DATABASE_URL;
    process.env.DB_DRIVER = "invalid";
    process.env.DB_IDLE_TIMEOUT_MS = "-10";
    process.env.DB_MAX_CONNECTIONS = "0";
    process.env.DB_EAGER_CONNECT_CHECK = "false";

    const configModule: typeof import("@/lib/db/config") = await import(
      `@/lib/db/config?config-invalid=${Date.now()}`
    );

    expect(() => configModule.getConnectionString()).toThrow(
      "Missing required environment variable",
    );
    expect(() => configModule.getDbDriver()).toThrow(
      "Invalid environment variable: DB_DRIVER",
    );
    expect(configModule.getDbIdleTimeoutMs()).toBe(1000);
    expect(configModule.getDbMaxConnections()).toBe(1);
    expect(configModule.shouldRunInitialDbConnectivityCheck()).toBe(false);

    restoreDbEnv(previousEnv);
  });
});

describe("db initialization", () => {
  test("getDb throws when DATABASE_URL is missing", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };
    resetDbGlobalState();
    delete process.env.DATABASE_URL;

    const { getDb } = await import(`@/lib/db/db?missing-url=${Date.now()}`);

    expect(() => getDb()).toThrow(
      "Database access is unavailable while placeholder mode is active",
    );
    restoreDbEnv(previousEnv);
  });

  test("getDb uses parsed pool config and caches the db instance", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };
    resetDbGlobalState();
    process.env.DATABASE_URL = "postgres://example/test";
    process.env.DB_MAX_CONNECTIONS = "7";
    process.env.DB_IDLE_TIMEOUT_MS = "2500";
    process.env.DB_EAGER_CONNECT_CHECK = "false";

    let capturedProviderOptions: null | Record<string, unknown> = null;
    const queryMock = mock(async () => [{ ok: true }]);
    const dbModule: typeof import("@/lib/db/db") = await import(
      `@/lib/db/db?pool-config=${Date.now()}`
    );
    dbModule.setDbDependenciesForTesting({
      createDatabaseProvider: () => {
        capturedProviderOptions = {
          connectionString: process.env.DATABASE_URL,
          idleTimeoutMillis: 2500,
          maxConnections: 7,
        };

        return {
          db: { queryMock, tag: "db-instance" },
          pool: { query: queryMock },
        } as never;
      },
    });

    const { getDb } = dbModule;

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(capturedProviderOptions).toBeDefined();
    if (capturedProviderOptions === null) {
      throw new Error("Provider options were not captured");
    }
    const normalizedProviderOptions = capturedProviderOptions as Record<
      string,
      unknown
    >;
    expect(normalizedProviderOptions.connectionString).toBe(
      "postgres://example/test",
    );
    expect(normalizedProviderOptions.maxConnections).toBe(7);
    expect(normalizedProviderOptions.idleTimeoutMillis).toBe(2500);
    expect(queryMock).not.toHaveBeenCalled();
    dbModule.resetDbDependenciesForTesting();
    restoreDbEnv(previousEnv);
  });

  test("getDb falls back to default pool config on invalid env values", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };
    resetDbGlobalState();
    process.env.DATABASE_URL = "postgres://example/test";
    process.env.DB_MAX_CONNECTIONS = "not-a-number";
    process.env.DB_IDLE_TIMEOUT_MS = "-1";
    process.env.DB_EAGER_CONNECT_CHECK = "false";

    let capturedProviderOptions: null | Record<string, unknown> = null;
    const dbModule: typeof import("@/lib/db/db") = await import(
      `@/lib/db/db?invalid-env=${Date.now()}`
    );
    dbModule.setDbDependenciesForTesting({
      createDatabaseProvider: () => {
        capturedProviderOptions = {
          connectionString: process.env.DATABASE_URL,
          idleTimeoutMillis: 1000,
          maxConnections: 1,
        };

        return {
          db: { mockedDb: true },
          pool: { query: mock(async () => [{ ok: true }]) },
        } as never;
      },
    });

    const { getDb } = dbModule;
    void getDb();

    expect(capturedProviderOptions).toBeDefined();
    if (capturedProviderOptions === null) {
      throw new Error("Provider options were not captured");
    }
    const normalizedProviderOptions = capturedProviderOptions as Record<
      string,
      unknown
    >;
    expect(normalizedProviderOptions.connectionString).toBe(
      "postgres://example/test",
    );
    expect(normalizedProviderOptions.maxConnections).toBe(1);
    expect(normalizedProviderOptions.idleTimeoutMillis).toBe(1000);
    dbModule.resetDbDependenciesForTesting();
    restoreDbEnv(previousEnv);
  });

  test("eager connectivity check logs warning only once", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
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

    const dbModule: typeof import("@/lib/db/db") = await import(
      `@/lib/db/db?eager-check=${Date.now()}`
    );
    dbModule.setDbDependenciesForTesting({
      createDatabaseProvider: () =>
        ({
          db: { mockedDb: true },
          pool: { query: queryMock },
        }) as never,
      warn: warnMock,
    });

    const { getDb } = dbModule;

    void getDb();
    // Allow queued catch handler to run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    void getDb();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledTimes(1);
    dbModule.resetDbDependenciesForTesting();
    restoreDbEnv(previousEnv);
  });

  test("getDb throws when DB_DRIVER is invalid", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };
    resetDbGlobalState();
    process.env.DATABASE_URL = "postgres://example/test";
    process.env.DB_DRIVER = "invalid";

    const { getDb } = await import(`@/lib/db/db?invalid-driver=${Date.now()}`);

    expect(() => getDb()).toThrow("Invalid environment variable: DB_DRIVER");
    restoreDbEnv(previousEnv);
  });

  test("getDb uses the Neon provider when DB_DRIVER is neon", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };
    resetDbGlobalState();
    process.env.DATABASE_URL = "postgres://example/test";
    process.env.DB_DRIVER = "neon";
    process.env.DB_MAX_CONNECTIONS = "5";
    process.env.DB_IDLE_TIMEOUT_MS = "1800";
    process.env.DB_EAGER_CONNECT_CHECK = "false";

    let capturedProviderOptions: null | Record<string, unknown> = null;
    const dbModule: typeof import("@/lib/db/db") = await import(
      `@/lib/db/db?neon-driver=${Date.now()}`
    );
    dbModule.setDbDependenciesForTesting({
      createDatabaseProvider: () => {
        capturedProviderOptions = {
          connectionString: process.env.DATABASE_URL,
          idleTimeoutMillis: 1800,
          maxConnections: 5,
        };

        return {
          db: { tag: "neon-db" },
          pool: { query: mock(async () => [{ ok: true }]) },
        } as never;
      },
    });

    const { getDb } = dbModule;

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(capturedProviderOptions).toBeDefined();
    if (capturedProviderOptions === null) {
      throw new Error("Provider options were not captured");
    }
    const normalizedProviderOptions = capturedProviderOptions as Record<
      string,
      unknown
    >;
    expect(normalizedProviderOptions.connectionString).toBe(
      "postgres://example/test",
    );
    expect(normalizedProviderOptions.maxConnections).toBe(5);
    expect(normalizedProviderOptions.idleTimeoutMillis).toBe(1800);
    dbModule.resetDbDependenciesForTesting();
    restoreDbEnv(previousEnv);
  });

  test("createSqlQueryExecutor uses Neon stateless queries when DB_DRIVER is neon", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };
    process.env.DATABASE_URL = "postgres://example/test";
    process.env.DB_DRIVER = "neon";

    const closeMock = mock(async () => undefined);
    const queryMock = mock(async () => ({
      rowCount: 1,
      rows: [{ version: "PostgreSQL 17.4" }],
    }));

    const queryExecutorModule: typeof import("@/lib/db/query-executor") =
      await import(`@/lib/db/query-executor?neon-query-executor=${Date.now()}`);
    queryExecutorModule.setSqlQueryExecutorFactoryForTesting(() => ({
      close: closeMock,
      query: queryMock as unknown as SqlQueryExecutor["query"],
    }));
    const { createSqlQueryExecutor } = queryExecutorModule;

    const executor = createSqlQueryExecutor();
    const result = await executor.query<{ version: string }>(
      "SELECT version()",
    );
    await executor.close();

    expect(queryMock).toHaveBeenCalledWith("SELECT version()");
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(result.rows[0]?.version).toBe("PostgreSQL 17.4");
    expect(result.rowCount).toBe(1);
    queryExecutorModule.resetSqlQueryExecutorFactoryForTesting();
    restoreDbEnv(previousEnv);
  });
});

describe("db providers", () => {
  test("createNodePostgresDatabase builds a pooled drizzle instance and executor reuses one client", async () => {
    const originalConnect = Client.prototype.connect;
    const originalQuery = Client.prototype.query;
    const originalEnd = Client.prototype.end;
    const connectMock = mock(async () => undefined);
    const queryMock = mock(async () => ({
      rowCount: undefined,
      rows: [{ id: 1 }, "skip", null],
    }));
    const endMock = mock(async () => undefined);

    Client.prototype.connect =
      connectMock as unknown as typeof Client.prototype.connect;
    Client.prototype.query =
      queryMock as unknown as typeof Client.prototype.query;
    Client.prototype.end = endMock as typeof Client.prototype.end;

    let pool: null | Pool = null;
    try {
      const nodeProviderModule: typeof import("@/lib/db/node-postgres-provider") =
        await import(`@/lib/db/node-postgres-provider?provider=${Date.now()}`);
      const databaseResult = nodeProviderModule.createNodePostgresDatabase({
        connectionString: "postgres://example/test",
        idleTimeoutMillis: 1500,
        maxConnections: 3,
      });
      pool = databaseResult.pool as Pool;

      expect(databaseResult.db).toBeDefined();
      expect(databaseResult.pool).toBeInstanceOf(Pool);

      const executor = nodeProviderModule.createNodePostgresQueryExecutor(
        "postgres://example/test",
      );

      await expect(executor.query("SELECT 1", [1, "two"])).resolves.toEqual({
        rowCount: null,
        rows: [{ id: 1 }],
      });
      await expect(executor.query("SELECT 2")).resolves.toEqual({
        rowCount: null,
        rows: [{ id: 1 }],
      });

      expect(connectMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenNthCalledWith(1, "SELECT 1", [1, "two"]);
      expect(queryMock).toHaveBeenNthCalledWith(2, "SELECT 2", []);

      await executor.close();
      await executor.close();
      expect(endMock).toHaveBeenCalledTimes(1);
    } finally {
      Client.prototype.connect = originalConnect;
      Client.prototype.query = originalQuery;
      Client.prototype.end = originalEnd;
      await pool?.end();
    }
  });

  test("createNeonDatabase and createNeonQueryExecutor configure neon transport and normalize query results", async () => {
    const createdPools: Record<string, unknown>[] = [];
    const neonQueryMock = mock(async () => ({
      rowCount: 2,
      rows: [{ id: 1 }, { id: 2 }],
    }));
    const drizzleMock = mock((pool: unknown) => ({ pool, tag: "neon-db" }));

    mock.module("@neondatabase/serverless", () => {
      const neonConfig = { poolQueryViaFetch: false };

      return {
        neon: () => ({ query: neonQueryMock }),
        neonConfig,
        Pool: class MockPool {
          constructor(config: Record<string, unknown>) {
            createdPools.push(config);
          }
        },
      };
    });
    mock.module("drizzle-orm/neon-serverless", () => ({
      drizzle: drizzleMock,
    }));

    const neonProviderModule: typeof import("@/lib/db/neon-provider") =
      await import(`@/lib/db/neon-provider?provider=${Date.now()}`);
    const serverlessModule = await import("@neondatabase/serverless");

    const databaseResult = neonProviderModule.createNeonDatabase({
      connectionString: "postgres://example/neon",
      idleTimeoutMillis: 2200,
      maxConnections: 5,
    });

    expect((databaseResult.db as unknown as { tag?: string }).tag).toBe(
      "neon-db",
    );
    expect(createdPools).toEqual([
      {
        allowExitOnIdle: true,
        connectionString: "postgres://example/neon",
        idleTimeoutMillis: 2200,
        max: 5,
      },
    ]);
    expect(drizzleMock).toHaveBeenCalledTimes(1);
    expect(serverlessModule.neonConfig.poolQueryViaFetch).toBe(true);

    const executor = neonProviderModule.createNeonQueryExecutor(
      "postgres://example/neon",
    );
    await expect(executor.query("SELECT 1", ["x"])).resolves.toEqual({
      rowCount: 2,
      rows: [{ id: 1 }, { id: 2 }],
    });
    await expect(executor.close()).resolves.toBeUndefined();
    expect(neonQueryMock).toHaveBeenCalledWith("SELECT 1", ["x"]);
  });

  test("createSqlQueryExecutor throws before loading any driver in placeholder mode", async () => {
    const previousEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_DRIVER: process.env.DB_DRIVER,
      DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
      DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
      DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
    };
    delete process.env.DATABASE_URL;

    const queryExecutorModule: typeof import("@/lib/db/query-executor") =
      await import(`@/lib/db/query-executor?missing-url=${Date.now()}`);

    expect(() => queryExecutorModule.createSqlQueryExecutor()).toThrow(
      "Database access is unavailable while placeholder mode is active",
    );

    restoreDbEnv(previousEnv);
  });
});
