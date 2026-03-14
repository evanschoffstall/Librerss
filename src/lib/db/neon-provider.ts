import {
  type FullQueryResults,
  neon,
  neonConfig,
  Pool,
} from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";
import type {
  Database,
  DatabaseProviderResult,
  QueryResultRow,
  SqlQueryExecutor,
  SqlQueryResult,
} from "./types";

interface NeonDatabaseOptions {
  connectionString: string;
  idleTimeoutMillis: number;
  maxConnections: number;
}

/** Builds a Neon-backed Drizzle instance with on-demand transaction sessions. */
export function createNeonDatabase(
  options: NeonDatabaseOptions,
): DatabaseProviderResult {
  configureNeonQueryTransport();

  const pool = new Pool({
    allowExitOnIdle: true,
    connectionString: options.connectionString,
    idleTimeoutMillis: options.idleTimeoutMillis,
    max: options.maxConnections,
  });

  return {
    db: drizzle(pool, { schema }) as unknown as Database,
    pool,
  };
}

/** Creates a stateless HTTP query executor for Bun scripts. */
export function createNeonQueryExecutor(
  connectionString: string,
): SqlQueryExecutor {
  const sql = neon(connectionString, { fullResults: true });

  return {
    async close() {},
    async query<TRow extends QueryResultRow = QueryResultRow>(
      queryText: string,
      params: readonly unknown[] = [],
    ): Promise<SqlQueryResult<TRow>> {
      const result = await sql.query(queryText, [...params]);

      return toSqlQueryResult<TRow>(result);
    },
  };
}

/**
 * Enables Neon fetch-backed one-shot queries while preserving interactive
 * transactions through Pool.connect() when Drizzle explicitly opens one.
 */
function configureNeonQueryTransport(): void {
  neonConfig.poolQueryViaFetch = true;
}

function toSqlQueryResult<TRow extends QueryResultRow>(
  result: FullQueryResults<false>,
): SqlQueryResult<TRow> {
  return {
    rowCount: typeof result.rowCount === "number" ? result.rowCount : null,
    rows: result.rows as TRow[],
  };
}
