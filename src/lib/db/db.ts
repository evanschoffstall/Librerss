import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

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
    globalForDb.pool || new Pool({ connectionString: getConnectionString() });
  const db = drizzle(pool, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.pool = pool;
    globalForDb.db = db;
  }

  return db;
}
