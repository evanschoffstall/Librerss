import { afterEach, describe, expect, test } from "bun:test";

import {
  assertDatabaseConfigured,
  getConnectionString,
  getDbDriver,
  getDbIdleTimeoutMs,
  getDbMaxConnections,
  shouldRunInitialDbConnectivityCheck,
} from "@/lib/db/config";
import { normalizePostgresConnectionString } from "@/lib/db/connection-string";

interface DbEnvSnapshot {
  DATABASE_URL?: string;
  DB_DRIVER?: string;
  DB_EAGER_CONNECT_CHECK?: string;
  DB_IDLE_TIMEOUT_MS?: string;
  DB_MAX_CONNECTIONS?: string;
}

function restoreEnv(snapshot: DbEnvSnapshot): void {
  if (snapshot.DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = snapshot.DATABASE_URL;
  }

  if (snapshot.DB_DRIVER === undefined) {
    delete process.env.DB_DRIVER;
  } else {
    process.env.DB_DRIVER = snapshot.DB_DRIVER;
  }

  if (snapshot.DB_EAGER_CONNECT_CHECK === undefined) {
    delete process.env.DB_EAGER_CONNECT_CHECK;
  } else {
    process.env.DB_EAGER_CONNECT_CHECK = snapshot.DB_EAGER_CONNECT_CHECK;
  }

  if (snapshot.DB_IDLE_TIMEOUT_MS === undefined) {
    delete process.env.DB_IDLE_TIMEOUT_MS;
  } else {
    process.env.DB_IDLE_TIMEOUT_MS = snapshot.DB_IDLE_TIMEOUT_MS;
  }

  if (snapshot.DB_MAX_CONNECTIONS === undefined) {
    delete process.env.DB_MAX_CONNECTIONS;
  } else {
    process.env.DB_MAX_CONNECTIONS = snapshot.DB_MAX_CONNECTIONS;
  }
}

function snapshotEnv(): DbEnvSnapshot {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_DRIVER: process.env.DB_DRIVER,
    DB_EAGER_CONNECT_CHECK: process.env.DB_EAGER_CONNECT_CHECK,
    DB_IDLE_TIMEOUT_MS: process.env.DB_IDLE_TIMEOUT_MS,
    DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
  };
}

const originalEnv = snapshotEnv();

afterEach(() => {
  restoreEnv(originalEnv);
});

describe("db config coverage", () => {
  test("normalizes supported ssl aliases and preserves passthrough cases", () => {
    expect(
      normalizePostgresConnectionString(
        "postgres://user:pass@example.com/db?sslmode=prefer",
      ),
    ).toBe("postgres://user:pass@example.com/db?sslmode=verify-full");

    expect(
      normalizePostgresConnectionString(
        "postgres://user:pass@example.com/db?sslmode=require&uselibpqcompat=true",
      ),
    ).toBe(
      "postgres://user:pass@example.com/db?sslmode=require&uselibpqcompat=true",
    );

    expect(
      normalizePostgresConnectionString(
        "postgres://user:pass@example.com/db?sslmode=disable",
      ),
    ).toBe("postgres://user:pass@example.com/db?sslmode=disable");

    expect(
      normalizePostgresConnectionString("postgres://user:pass@example.com/db"),
    ).toBe("postgres://user:pass@example.com/db");
  });

  test("requires a configured database url and normalizes it when present", () => {
    const previousEnv = snapshotEnv();
    delete process.env.DATABASE_URL;

    expect(() => assertDatabaseConfigured()).toThrow(
      "Database access is unavailable while placeholder mode is active",
    );
    expect(() => getConnectionString()).toThrow(
      "Missing required environment variable: DATABASE_URL",
    );

    process.env.DATABASE_URL =
      "  postgres://example/config?sslmode=require&channel_binding=require  ";

    expect(() => assertDatabaseConfigured()).not.toThrow();
    expect(getConnectionString()).toBe(
      "postgres://example/config?sslmode=verify-full&channel_binding=require",
    );

    restoreEnv(previousEnv);
  });

  test("defaults the driver to pg and rejects invalid values", () => {
    const previousEnv = snapshotEnv();
    delete process.env.DB_DRIVER;
    expect(getDbDriver()).toBe("pg");

    process.env.DB_DRIVER = "NeOn";
    expect(getDbDriver()).toBe("neon");

    process.env.DB_DRIVER = "invalid";
    expect(() => getDbDriver()).toThrow(
      "Invalid environment variable: DB_DRIVER. Expected one of: pg, neon.",
    );

    restoreEnv(previousEnv);
  });

  test("falls back for invalid pool settings and accepts valid ones", () => {
    const previousEnv = snapshotEnv();

    delete process.env.DB_IDLE_TIMEOUT_MS;
    delete process.env.DB_MAX_CONNECTIONS;
    expect(getDbIdleTimeoutMs()).toBe(1000);
    expect(getDbMaxConnections()).toBe(1);

    process.env.DB_IDLE_TIMEOUT_MS = "-10";
    process.env.DB_MAX_CONNECTIONS = "0";
    expect(getDbIdleTimeoutMs()).toBe(1000);
    expect(getDbMaxConnections()).toBe(1);

    process.env.DB_IDLE_TIMEOUT_MS = "2500";
    process.env.DB_MAX_CONNECTIONS = "7";
    expect(getDbIdleTimeoutMs()).toBe(2500);
    expect(getDbMaxConnections()).toBe(7);

    restoreEnv(previousEnv);
  });

  test("reads the eager connectivity flag from env", () => {
    const previousEnv = snapshotEnv();

    delete process.env.DB_EAGER_CONNECT_CHECK;
    expect(shouldRunInitialDbConnectivityCheck()).toBe(false);

    process.env.DB_EAGER_CONNECT_CHECK = "true";
    expect(shouldRunInitialDbConnectivityCheck()).toBe(true);

    process.env.DB_EAGER_CONNECT_CHECK = "false";
    expect(shouldRunInitialDbConnectivityCheck()).toBe(false);

    restoreEnv(previousEnv);
  });
});
