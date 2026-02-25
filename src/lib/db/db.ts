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
      // max=1 means at most one connection is held; idleTimeoutMillis=0
      // releases it immediately after use rather than keeping it warm.
      max: 1,
      idleTimeoutMillis: 0,
    });

  runInitialDbConnectivityCheck(pool);
  const db = drizzle(pool, { schema });

  globalForDb.pool = pool;
  globalForDb.db = db;

  return db;
}
