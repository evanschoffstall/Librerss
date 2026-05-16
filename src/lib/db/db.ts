import { logger } from "@/lib";

import type { Database, DatabasePool, DatabaseProviderResult } from "./types";

import {
  assertDatabaseConfigured,
  getConnectionString,
  getDbDriver,
  getDbIdleTimeoutMs,
  getDbMaxConnections,
  shouldRunInitialDbConnectivityCheck,
} from "./config";
import { createNeonDatabase } from "./neon-provider";
import { createNodePostgresDatabase } from "./node-postgres-provider";

// Extend globalThis so the DB singleton survives hot-module reloads in dev
// without accumulating duplicate pool instances across re-evaluations of this
// module. `var` is required because TypeScript's `declare global` only
// recognises ambient `var` declarations — not `let` or `const`.
declare global {
  var __db: Database | undefined;

  var __dbPool: DatabasePool | undefined;

  var __dbConnectionWarningLogged: boolean | undefined;

  var __dbConnectivityCheckRan: boolean | undefined;
}

/**
 * Minimal pool interface used only for the startup connectivity probe.
 *
 * Both `pg.Pool` and `@neondatabase/serverless Pool` satisfy this contract at
 * runtime; the adapter in {@link toConnectivityCheckPool} narrows to it safely
 * without needing a cast.
 */
interface ConnectivityCheckPool {
  query(queryText: string): Promise<unknown>;
}

/**
 * Describes the DB dependencies.
 */
interface DbDependencies {
  createDatabaseProvider: () => DatabaseProviderResult;
  warn: DbWarnFn;
}

/**
 * Defines the DB warn fn type.
 */
type DbWarnFn = (message: string, context?: Record<string, unknown>) => void;

const defaultDbDependencies: DbDependencies = {
  createDatabaseProvider: createRuntimeDatabaseProvider,
  /**
   * Emits a warning through the application logger.
   * @param message - Human-readable warning message.
   * @param context - Optional structured context attached to the log entry.
   */
  warn: (message, context) => {
    logger.warn(message, context);
  },
};

let dbDependencies: DbDependencies = defaultDbDependencies;

/**
 * Returns the singleton database instance, initialising it on first call.
 *
 * The instance is stored on `globalThis` so it survives Next.js hot-module
 * reloads in development without leaking connection pools.
 *
 * @returns The application-wide Drizzle database instance.
 */
export function getDb() {
  if (globalThis.__db) {
    return globalThis.__db;
  }

  const { db, pool } = dbDependencies.createDatabaseProvider();

  if (shouldRunInitialDbConnectivityCheck()) {
    runInitialDbConnectivityCheck(toConnectivityCheckPool(pool));
  }

  globalThis.__dbPool = pool;
  globalThis.__db = db;

  return db;
}

/**
 * Returns whether the error is a foreign-key constraint violation.
 * @param error - The caught error to inspect.
 * @returns `true` when the underlying Postgres error code is `23503`.
 */
export function isForeignKeyError(error: unknown): boolean {
  return hasDbErrorCode(error, "23503");
}

/**
 * Returns whether the error is a unique-constraint violation.
 * @param error - The caught error to inspect.
 * @returns `true` when the underlying Postgres error code is `23505`.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return hasDbErrorCode(error, "23505");
}

/**
 * Restores the default DB dependency injection bindings.
 *
 * Must be called in both `beforeEach` and `afterEach` in tests that override
 * {@link setDbDependenciesForTesting} to prevent state leaking between suites.
 */
export function resetDbDependenciesForTesting(): void {
  dbDependencies = defaultDbDependencies;
  clearDbSingletonState();
}

/**
 * Overrides one or more DB dependency injection bindings for testing.
 *
 * Unspecified bindings fall through to the current defaults, so callers only
 * need to supply the dependencies they actually want to stub.
 *
 * @param dependencies - Partial set of dependency overrides to apply.
 */
export function setDbDependenciesForTesting(
  dependencies: Partial<DbDependencies>,
): void {
  dbDependencies = {
    ...dbDependencies,
    ...dependencies,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Removes the cached DB and pool handles from `globalThis` so the next
 * {@link getDb} call re-initialises from scratch.
 */
function clearDbSingletonState(): void {
  delete globalThis.__dbPool;
  delete globalThis.__db;
  delete globalThis.__dbConnectionWarningLogged;
  delete globalThis.__dbConnectivityCheckRan;
}

/**
 * Initialises the correct database provider based on the `DB_DRIVER` env var.
 * @returns A `{ db, pool }` provider result ready for use.
 */
function createRuntimeDatabaseProvider(): DatabaseProviderResult {
  assertDatabaseConfigured();

  const options = {
    connectionString: getConnectionString(),
    idleTimeoutMillis: getDbIdleTimeoutMs(),
    maxConnections: getDbMaxConnections(),
  };

  if (getDbDriver() === "neon") {
    return createNeonDatabase(options);
  }

  return createNodePostgresDatabase(options);
}

/**
 * Extracts a human-readable message from an unknown thrown value.
 * @param error - The caught value to inspect.
 * @returns The `.message` property for `Error` instances, or `String(error)` otherwise.
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns whether an unknown error carries the given Postgres error code.
 * @param error - The caught value to inspect.
 * @param code - The Postgres error code string (e.g. `"23505"`).
 * @returns `true` when the error object has a matching `code` property.
 */
function hasDbErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: unknown }).code === code;
}

/**
 * Fires the startup connectivity probe and logs a warning on failure.
 *
 * The check runs at most once per process lifetime; subsequent calls are
 * no-ops. Errors are swallowed so a flaky DB connection does not prevent
 * the app from starting.
 *
 * @param pool - Narrowed pool reference used to issue the probe query.
 */
function runInitialDbConnectivityCheck(pool: ConnectivityCheckPool) {
  if (globalThis.__dbConnectivityCheckRan) {
    return;
  }

  globalThis.__dbConnectivityCheckRan = true;

  void pool.query("select 1").catch((error: unknown) => {
    if (globalThis.__dbConnectionWarningLogged) {
      return;
    }

    globalThis.__dbConnectionWarningLogged = true;

    const message = getErrorMessage(error);
    dbDependencies.warn("[db] Initial database connectivity check failed", {
      error: message,
      note: "The app will continue running, but database-backed features may fail until the connection is restored.",
    });
  });
}

/**
 * Adapts a `DatabasePool` to the minimal {@link ConnectivityCheckPool} interface.
 *
 * Both `pg.Pool` and `@neondatabase/serverless Pool` expose a compatible `query`
 * method at runtime, but TypeScript cannot unify their overloaded call signatures
 * across the union type, so a targeted `as unknown as` cast is required here.
 *
 * @param pool - The live database pool to adapt.
 * @returns A `ConnectivityCheckPool` backed by the provided pool.
 */
function toConnectivityCheckPool(pool: DatabasePool): ConnectivityCheckPool {
  const probePool = pool as unknown as ConnectivityCheckPool;
  return {
    /**
     * Issues a raw SQL query through the underlying pool.
     * @param queryText - The SQL statement to execute.
     * @returns A promise that resolves to the raw driver query result.
     */
    query: (queryText) => probePool.query(queryText),
  };
}
