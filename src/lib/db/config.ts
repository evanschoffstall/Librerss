import { envBooleanOptional } from "@/lib";
import { normalizePostgresConnectionString } from "@/lib/db/connection-string";

/** Supported runtime database drivers for the application. */
type DbDriver = "neon" | "pg";

const DEFAULT_DB_MAX_CONNECTIONS = 1;
const DEFAULT_DB_IDLE_TIMEOUT_MS = 1_000;

const DATABASE_UNAVAILABLE_MESSAGE =
  "Database access is unavailable while placeholder mode is active. Configure DATABASE_URL to enable database-backed features.";

/**
 * Process the assert database configured.
 */
export function assertDatabaseConfigured(): void {
  if (!hasDatabaseConnectionString()) {
    throw new Error(DATABASE_UNAVAILABLE_MESSAGE);
  }
}

/**
 * Return the connection string.
 * @returns The connection string.
 */
export function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL. " +
        "Add it to your .env.local file.",
    );
  }

  return normalizePostgresConnectionString(connectionString);
}

/**
 * Return the db driver.
 * @returns The db driver.
 */
export function getDbDriver(): DbDriver {
  const rawValue = process.env.DB_DRIVER?.trim().toLowerCase();
  if (!rawValue) {
    return "pg";
  }

  if (rawValue === "neon" || rawValue === "pg") {
    return rawValue;
  }

  throw new Error(
    "Invalid environment variable: DB_DRIVER. Expected one of: pg, neon.",
  );
}

/**
 * Return the db idle timeout ms.
 * @returns The db idle timeout ms.
 */
export function getDbIdleTimeoutMs(): number {
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

/**
 * Return the db max connections.
 * @returns The db max connections.
 */
export function getDbMaxConnections(): number {
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

/**
 * Return whether should run initial db connectivity check.
 * @returns Whether should run initial db connectivity check.
 */
export function shouldRunInitialDbConnectivityCheck(): boolean {
  return envBooleanOptional("DB_EAGER_CONNECT_CHECK", false);
}

/**
 * Return whether has database connection string.
 * @returns Whether has database connection string.
 */
function hasDatabaseConnectionString(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
