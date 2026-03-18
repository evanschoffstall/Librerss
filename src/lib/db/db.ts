import { logger } from "@/lib/logger";
import { toErrorMessage } from "@/lib/utils/errors";

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
  warn: (message, context) => {
    logger.warn(message, context);
  },
};

let dbDependencies: DbDependencies = defaultDbDependencies;

/** Returns the singleton Drizzle instance for the active database driver. */
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

export function isForeignKeyError(error: unknown): boolean {
  return hasDbErrorCode(error, "23503");
}

export function isUniqueConstraintError(error: unknown): boolean {
  return hasDbErrorCode(error, "23505");
}

/** Restores the default DB seams and clears cached singleton state. */
export function resetDbDependenciesForTesting(): void {
  dbDependencies = defaultDbDependencies;
  clearDbSingletonState();
}

/** Overrides DB seams for an isolated test module instance. */
export function setDbDependenciesForTesting(
  dependencies: Partial<DbDependencies>,
): void {
  dbDependencies = {
    ...dbDependencies,
    ...dependencies,
  };
}

// ─── DB error utilities ─────────────────────────────────────────────────────

function clearDbSingletonState(): void {
  delete globalForDb.pool;
  delete globalForDb.db;
  delete globalForDb.hasLoggedInitialDbConnectionWarning;
  delete globalForDb.hasRunInitialDbConnectivityCheck;
}

/** Loads only the provider module needed for the active runtime driver. */
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

function hasDbErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: unknown }).code === code;
}

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

    const message = toErrorMessage(error);
    dbDependencies.warn("[db] Initial database connectivity check failed", {
      error: message,
      note: "The app will continue running, but database-backed features may fail until the connection is restored.",
    });
  });
}

function toConnectivityCheckPool(pool: DatabasePool): ConnectivityCheckPool {
  return pool as unknown as ConnectivityCheckPool;
}
