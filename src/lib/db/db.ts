import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

import { logger } from "@/lib/logger";
import { toErrorMessage } from "@/lib/utils/errors";

const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof drizzle<typeof schema>>;
  hasLoggedInitialDbConnectionWarning?: boolean;
  hasRunInitialDbConnectivityCheck?: boolean;
  pool?: Pool;
};

const DEFAULT_DB_MAX_CONNECTIONS = 1;
const DEFAULT_DB_IDLE_TIMEOUT_MS = 1_000;

export function getDb() {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const pool =
    globalForDb.pool ??
    new Pool({
      allowExitOnIdle: true,
      connectionString: getConnectionString(),
      idleTimeoutMillis: getDbIdleTimeoutMs(),
      // Keep the pool minimal so endpoints can suspend when idle.
      // max defaults to 1 and idleTimeoutMillis defaults to 1000ms,
      // which allows pg to close idle clients quickly.
      max: getDbMaxConnections(),
    });

  if (shouldRunInitialDbConnectivityCheck()) {
    runInitialDbConnectivityCheck(pool);
  }
  const db = drizzle(pool, { schema });

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

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL. " +
        "Add it to your .env.local file.",
    );
  }

  return connectionString;
}

function getDbIdleTimeoutMs(): number {
  const rawValue = process.env.DB_IDLE_TIMEOUT_MS;
  if (!rawValue) {
    return DEFAULT_DB_IDLE_TIMEOUT_MS;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return DEFAULT_DB_IDLE_TIMEOUT_MS;
  }

  return parsedValue;
}

function getDbMaxConnections(): number {
  const rawValue = process.env.DB_MAX_CONNECTIONS;
  if (!rawValue) {
    return DEFAULT_DB_MAX_CONNECTIONS;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return DEFAULT_DB_MAX_CONNECTIONS;
  }

  return parsedValue;
}

// ─── DB error utilities ─────────────────────────────────────────────────────

function hasDbErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: unknown }).code === code;
}

function runInitialDbConnectivityCheck(pool: Pool) {
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
    logger.warn("[db] Initial database connectivity check failed", {
      error: message,
      note: "The app will continue running, but database-backed features may fail until the connection is restored.",
    });
  });
}

function shouldRunInitialDbConnectivityCheck(): boolean {
  return process.env.DB_EAGER_CONNECT_CHECK === "true";
}
