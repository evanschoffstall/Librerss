import {
  type FullQueryResults,
  neon,
  neonConfig,
  Pool,
} from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import type {
  Database,
  DatabaseProviderResult,
  QueryResultRow,
  SqlQueryExecutor,
  SqlQueryResult,
} from "./types";

import * as schema from "./schema";

interface NeonDatabaseOptions {
  connectionString: string;
  idleTimeoutMillis: number;
  maxConnections: number;
}

/**
 * Builds a Neon-backed Drizzle instance with on-demand transaction sessions.
 * @param options
 */
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

/**
 * Creates a stateless HTTP query executor for Bun scripts.
 *
 * The Neon client is created inside `query()` so an unused executor does not
 * initialize any transport state and every call stays one-shot over HTTP.
 * @param connectionString
 */
export function createNeonQueryExecutor(
  connectionString: string,
): SqlQueryExecutor {
  return {
    /**
     *
     */
    close() {
      return Promise.resolve();
    },
    /**
     * @param queryText
     * @param params
     */
    async query<TRow extends QueryResultRow = QueryResultRow>(
      queryText: string,
      params: readonly unknown[] = [],
    ): Promise<SqlQueryResult<TRow>> {
      const sql = neon(connectionString, { fullResults: true });
      const result = await sql.query(queryText, [...params]);

      return toSqlQueryResult<TRow>(result);
    },
  };
}

/**
 * Enables fetch-backed one-shot queries for normal Drizzle calls.
 *
 * Drizzle's Neon adapter still requires a `Pool` client object; with this flag
 * enabled, ordinary `pool.query()` calls stay HTTP-based and only explicit
 * transaction flows fall back to connection-oriented behavior.
 */
function configureNeonQueryTransport(): void {
  neonConfig.poolQueryViaFetch = true;
}

/**
 * @param result
 */
function toSqlQueryResult<TRow extends QueryResultRow>(
  result: FullQueryResults<false>,
): SqlQueryResult<TRow> {
  return {
    rowCount: typeof result.rowCount === "number" ? result.rowCount : null,
    rows: result.rows as TRow[],
  };
}
