import type { Pool as NeonPool } from "@neondatabase/serverless";
import type { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import type { Pool as NodePostgresPool } from "pg";

import type * as schema from "./schema";

/**
 * Canonical application database type.
 *
 * The public DB surface remains aligned with the existing node-postgres Drizzle
 * type so the rest of the codebase can stay unchanged when the runtime driver
 * is swapped underneath it.
 */
export type Database = ReturnType<typeof drizzleNodePostgres<typeof schema>>;

/**
 * Defines the database pool type.
 */
export type DatabasePool = NeonPool | NodePostgresPool;

/**
 * Describes the database provider result.
 */
export interface DatabaseProviderResult {
  db: Database;
  pool: DatabasePool;
}

/**
 * Defines the query result row type.
 */
export type QueryResultRow = Record<string, unknown>;

/** Minimal direct-SQL executor used by Bun scripts and one-shot checks. */
export interface SqlQueryExecutor {
  close(): Promise<void>;
  query<TRow extends QueryResultRow = QueryResultRow>(
    queryText: string,
    params?: readonly unknown[],
  ): Promise<SqlQueryResult<TRow>>;
}

/**
 * Describes the sql query result.
 */
export interface SqlQueryResult<TRow extends QueryResultRow = QueryResultRow> {
  rowCount: null | number;
  rows: TRow[];
}
