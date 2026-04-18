import type { SqlQueryExecutor } from "./types";

import {
  assertDatabaseConfigured,
  getConnectionString,
  getDbDriver,
} from "./config";
import { createNeonQueryExecutor } from "./neon-provider";
import { createNodePostgresQueryExecutor } from "./node-postgres-provider";

type QueryExecutorFactory = () => SqlQueryExecutor;

/**
 * Process the default query executor factory.
 * @returns The default query executor factory.
 */
const defaultQueryExecutorFactory: QueryExecutorFactory = () => {
  assertDatabaseConfigured();

  const connectionString = getConnectionString();

  if (getDbDriver() === "neon") {
    return createNeonQueryExecutor(connectionString);
  }

  return createNodePostgresQueryExecutor(connectionString);
};

let queryExecutorFactory: QueryExecutorFactory = defaultQueryExecutorFactory;

/**
 * Create the sql query executor.
 * @returns The sql query executor.
 */
export function createSqlQueryExecutor(): SqlQueryExecutor {
  return queryExecutorFactory();
}

/**
 * Process the reset sql query executor factory for testing.
 */
export function resetSqlQueryExecutorFactoryForTesting(): void {
  queryExecutorFactory = defaultQueryExecutorFactory;
}

/**
 * Process the set sql query executor factory for testing.
 * @param factory - The factory.
 */
export function setSqlQueryExecutorFactoryForTesting(
  factory: QueryExecutorFactory,
): void {
  queryExecutorFactory = factory;
}
