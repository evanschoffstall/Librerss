import type { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import type { Pool as NodePostgresPool } from "pg";

import * as schema from "./schema";

/**
 * Canonical application database type.
 *
 * The public DB surface remains aligned with the existing node-postgres Drizzle
 * type so the rest of the codebase can stay unchanged when the runtime driver
 * is swapped underneath it.
 */
export type Database = ReturnType<typeof drizzleNodePostgres<typeof schema>>;

export type DatabasePool = NeonPool | NodePostgresPool;

export interface DatabaseProviderResult {
  db: Database;
  pool: DatabasePool;
}

export type QueryResultRow = Record<string, unknown>;

/** Minimal direct-SQL executor used by Bun scripts and one-shot checks. */
export interface SqlQueryExecutor {
  close(): Promise<void>;
  query<TRow extends QueryResultRow = QueryResultRow>(
    queryText: string,
    params?: readonly unknown[],
  ): Promise<SqlQueryResult<TRow>>;
}

export interface SqlQueryResult<TRow extends QueryResultRow = QueryResultRow> {
  rowCount: null | number;
  rows: TRow[];
}
