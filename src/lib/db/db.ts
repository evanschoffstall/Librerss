import { toErrorMessage } from "@/lib/utils/errors";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: ReturnType<typeof drizzle<typeof schema>>;
  hasLoggedInitialDbConnectionWarning?: boolean;
  hasRunInitialDbConnectivityCheck?: boolean;
};

const DEFAULT_DB_MAX_CONNECTIONS = 1;
const DEFAULT_DB_IDLE_TIMEOUT_MS = 1_000;

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
    console.warn(
      `[db] Initial database connectivity check failed: ${message}. ` +
        "The app will continue running, but database-backed features may fail until the connection is restored.",
    );
  });
}

function shouldRunInitialDbConnectivityCheck(): boolean {
  return process.env.DB_EAGER_CONNECT_CHECK === "true";
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

export function getDb() {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const pool =
    globalForDb.pool ||
    new Pool({
      connectionString: getConnectionString(),
      // Keep the pool minimal so endpoints can suspend when idle.
      // max defaults to 1 and idleTimeoutMillis defaults to 1000ms,
      // which allows pg to close idle clients quickly.
      max: getDbMaxConnections(),
      idleTimeoutMillis: getDbIdleTimeoutMs(),
      allowExitOnIdle: true,
    });

  if (shouldRunInitialDbConnectivityCheck()) {
    runInitialDbConnectivityCheck(pool);
  }
  const db = drizzle(pool, { schema });

  globalForDb.pool = pool;
  globalForDb.db = db;

  return db;
}

// ─── Transaction helper (merged from transactions.ts) ────────────────────────

export async function withTransaction<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return operation();
}

// ─── DB error utilities (merged from db-errors.ts) ───────────────────────────

const PASSWORD_PATTERN = /(password\s*=\s*)([^\s]+)/gi;

export function sanitizeDbError(error: Error): Error {
  const sanitizedMessage = error.message.replace(
    PASSWORD_PATTERN,
    "$1[REDACTED]",
  );
  return new Error(sanitizedMessage);
}

function hasDbErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: unknown }).code === code;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return hasDbErrorCode(error, "23505");
}

export function isForeignKeyError(error: unknown): boolean {
  return hasDbErrorCode(error, "23503");
}
