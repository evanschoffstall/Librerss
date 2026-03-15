import { envBooleanOptional } from "@/lib/config";

/** Supported runtime database drivers for the application. */
type DbDriver = "neon" | "pg";

const DEFAULT_DB_MAX_CONNECTIONS = 1;
const DEFAULT_DB_IDLE_TIMEOUT_MS = 1_000;

const DATABASE_UNAVAILABLE_MESSAGE =
  "Database access is unavailable while placeholder mode is active. Configure DATABASE_URL to enable database-backed features.";

/** Fails fast before any driver module is loaded in placeholder-mode runtimes. */
export function assertDatabaseConfigured(): void {
  if (!hasDatabaseConnectionString()) {
    throw new Error(DATABASE_UNAVAILABLE_MESSAGE);
  }
}

/** Reads and validates DATABASE_URL for all database entrypoints. */
export function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL. " +
        "Add it to your .env.local file.",
    );
  }

  return connectionString;
}

/** Selects the database driver, defaulting to the existing node-postgres path. */
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

/** Parses the idle timeout used by long-lived pooled drivers. */
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

/** Parses the maximum database connections used by pooled drivers. */
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

/** Controls the non-fatal startup connectivity probe. */
export function shouldRunInitialDbConnectivityCheck(): boolean {
  return envBooleanOptional("DB_EAGER_CONNECT_CHECK", false);
}

/** Returns whether the current runtime has a usable database connection string. */
function hasDatabaseConnectionString(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
