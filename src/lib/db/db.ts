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

const globalForDb = globalThis as unknown as {
  db?: Database;
  hasLoggedInitialDbConnectionWarning?: boolean;
  hasRunInitialDbConnectivityCheck?: boolean;
  pool?: DatabasePool;
};

interface ConnectivityCheckPool {
  query(queryText: string): Promise<unknown>;
}

interface DbDependencies {
  createDatabaseProvider: () => DatabaseProviderResult;
  warn: DbWarnFn;
}

type DbWarnFn = (message: string, context?: Record<string, unknown>) => void;

const defaultDbDependencies: DbDependencies = {
  createDatabaseProvider: createRuntimeDatabaseProvider,
  /**
   * Process the warn.
   * @param message - The message.
   * @param context - The context used to process the warn.
   */
  warn: (message, context) => {
    logger.warn(message, context);
  },
};

let dbDependencies: DbDependencies = defaultDbDependencies;

/**
 * Return the db.
 * @returns The db.
 */
export function getDb() {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const { db, pool } = dbDependencies.createDatabaseProvider();

  if (shouldRunInitialDbConnectivityCheck()) {
    runInitialDbConnectivityCheck(toConnectivityCheckPool(pool));
  }

  globalForDb.pool = pool;
  globalForDb.db = db;

  return db;
}

/**
 * Return whether is foreign key error.
 * @param error - The error.
 * @returns Whether is foreign key error.
 */
export function isForeignKeyError(error: unknown): boolean {
  return hasDbErrorCode(error, "23503");
}

/**
 * Return whether is unique constraint error.
 * @param error - The error.
 * @returns Whether is unique constraint error.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return hasDbErrorCode(error, "23505");
}

/**
 * Process the reset db dependencies for testing.
 */
export function resetDbDependenciesForTesting(): void {
  dbDependencies = defaultDbDependencies;
  clearDbSingletonState();
}

/**
 * Process the set db dependencies for testing.
 * @param dependencies - The dependencies.
 */
export function setDbDependenciesForTesting(
  dependencies: Partial<DbDependencies>,
): void {
  dbDependencies = {
    ...dbDependencies,
    ...dependencies,
  };
}

// ─── DB error utilities ─────────────────────────────────────────────────────

/**
 * Process the clear db singleton state.
 */
function clearDbSingletonState(): void {
  delete globalForDb.pool;
  delete globalForDb.db;
  delete globalForDb.hasLoggedInitialDbConnectionWarning;
  delete globalForDb.hasRunInitialDbConnectivityCheck;
}

/**
 * Create the runtime database provider.
 * @returns The runtime database provider.
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
 * Return the error message.
 * @param error - The error.
 * @returns The error message.
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Return whether has db error code.
 * @param error - The error.
 * @param code - The code.
 * @returns Whether has db error code.
 */
function hasDbErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: unknown }).code === code;
}

/**
 * Process the run initial db connectivity check.
 * @param pool - The pool.
 */
function runInitialDbConnectivityCheck(pool: ConnectivityCheckPool) {
  if (globalForDb.hasRunInitialDbConnectivityCheck) {
    return;
  }

  globalForDb.hasRunInitialDbConnectivityCheck = true;

  void pool.query("select 1").catch((error: unknown) => {
    if (globalForDb.hasLoggedInitialDbConnectionWarning) {
      return;
    }

    globalForDb.hasLoggedInitialDbConnectionWarning = true;

    const message = getErrorMessage(error);
    dbDependencies.warn("[db] Initial database connectivity check failed", {
      error: message,
      note: "The app will continue running, but database-backed features may fail until the connection is restored.",
    });
  });
}

/**
 * Process the to connectivity check pool.
 * @param pool - The pool.
 * @returns The to connectivity check pool.
 */
function toConnectivityCheckPool(pool: DatabasePool): ConnectivityCheckPool {
  return pool as unknown as ConnectivityCheckPool;
}
