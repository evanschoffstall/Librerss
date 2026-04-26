import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import type {
  DatabaseProviderResult,
  QueryResultRow,
  SqlQueryExecutor,
  SqlQueryResult,
} from "./types";

import * as schema from "./schema";

/**
 * Describes the options for node postgres database.
 */
interface NodePostgresDatabaseOptions {
  connectionString: string;
  idleTimeoutMillis: number;
  maxConnections: number;
}

/**
 * Create the node postgres database.
 * @param options - The options used to create the node postgres database.
 * @returns The node postgres database.
 */
export function createNodePostgresDatabase(
  options: NodePostgresDatabaseOptions,
): DatabaseProviderResult {
  const pool = new Pool({
    allowExitOnIdle: true,
    connectionString: options.connectionString,
    idleTimeoutMillis: options.idleTimeoutMillis,
    max: options.maxConnections,
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}

/**
 * Create the node postgres query executor.
 * @param connectionString - The connection string.
 * @returns The node postgres query executor.
 */
export function createNodePostgresQueryExecutor(
  connectionString: string,
): SqlQueryExecutor {
  const client = new Client({ connectionString });
  let isConnected = false;
  /**
   * Process the query.
   * @param queryText - The query text.
   * @param params - The params.
   * @returns The query.
   */
  const query = async <TRow extends QueryResultRow = QueryResultRow>(
    queryText: string,
    params: readonly unknown[] = [],
  ): Promise<SqlQueryResult<TRow>> => {
    if (!isConnected) {
      await client.connect();
      isConnected = true;
    }

    const result = await client.query(queryText, [...params]);

    return {
      rowCount: result.rowCount ?? null,
      rows: toQueryRows(result.rows) as TRow[],
    };
  };

  return {
    /**
     * Process the close.
     */
    async close() {
      if (!isConnected) {
        return;
      }

      isConnected = false;
      await client.end();
    },
    query,
  };
}

/**
 * Process the to query rows.
 * @param rows - The rows.
 * @returns The to query rows.
 */
function toQueryRows(rows: unknown[]): QueryResultRow[] {
  return rows.flatMap((row) =>
    typeof row === "object" && row !== null ? [row as QueryResultRow] : [],
  );
}
