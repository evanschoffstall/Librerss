import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.SUPABASE_URL;
if (!connectionString) {
  throw new Error(
    "Missing required environment variable: SUPABASE_URL. " +
      "Add it to your .env.local file.",
  );
}

const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

const pool = globalForDb.pool || new Pool({ connectionString });

export const db = globalForDb.db || drizzle(pool, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
  globalForDb.db = db;
}
