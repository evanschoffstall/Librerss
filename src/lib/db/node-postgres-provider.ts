import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import type {
  DatabaseProviderResult,
  QueryResultRow,
  SqlQueryExecutor,
  SqlQueryResult,
} from "./types";

import * as schema from "./schema";

interface NodePostgresDatabaseOptions {
  connectionString: string;
  idleTimeoutMillis: number;
  maxConnections: number;
}

/**
 * Builds the existing node-postgres-backed Drizzle instance.
 * @param options
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
 * Creates a direct SQL executor that reuses a single client per script run.
 * @param connectionString
 */
export function createNodePostgresQueryExecutor(
  connectionString: string,
): SqlQueryExecutor {
  const client = new Client({ connectionString });
  let isConnected = false;
  /**
   * @param queryText
   * @param params
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
     *
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
 * @param rows
 */
function toQueryRows(rows: unknown[]): QueryResultRow[] {
  return rows.flatMap((row) =>
    typeof row === "object" && row !== null ? [row as QueryResultRow] : [],
  );
}
