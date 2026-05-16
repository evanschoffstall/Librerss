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

/**
 * Describes the options for neon database.
 */
interface NeonDatabaseOptions {
  connectionString: string;
  idleTimeoutMillis: number;
  maxConnections: number;
}

/**
 * Create the neon database.
 * @param options - The options used to create the neon database.
 * @returns The neon database.
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
    // The neon-serverless drizzle instance is runtime-compatible with the
    // node-postgres Database type but TypeScript tracks them as structurally
    // distinct due to adapter-specific internal symbols. The node-postgres
    // type is the app's canonical Database interface (see types.ts).
    // @ts-expect-error -- neon-serverless and node-postgres Drizzle instances share an identical query API at runtime but diverge in TypeScript's structural type graph
    db: drizzle(pool, { schema }) as Database,
    pool,
  };
}

/**
 * Create the neon query executor.
 * @param connectionString - The connection string.
 * @returns The neon query executor.
 */
export function createNeonQueryExecutor(
  connectionString: string,
): SqlQueryExecutor {
  return {
    /**
     * Closes the query executor.
     * @returns A resolved promise because Neon does not require explicit teardown.
     */
    close() {
      return Promise.resolve();
    },
    /**
     * Process the query.
     * @param queryText - The query text.
     * @param params - The params.
     * @returns The query.
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
 * Process the configure neon query transport.
 */
function configureNeonQueryTransport(): void {
  neonConfig.poolQueryViaFetch = true;
}

/**
 * Process the to sql query result.
 * @param result - The result.
 * @returns The to sql query result.
 */
function toSqlQueryResult<TRow extends QueryResultRow>(
  result: FullQueryResults<false>,
): SqlQueryResult<TRow> {
  return {
    rowCount: typeof result.rowCount === "number" ? result.rowCount : null,
    rows: result.rows as TRow[],
  };
}
