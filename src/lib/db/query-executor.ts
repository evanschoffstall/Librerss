import {
  assertDatabaseConfigured,
  getConnectionString,
  getDbDriver,
} from "./config";
import { createNeonQueryExecutor } from "./neon-provider";
import { createNodePostgresQueryExecutor } from "./node-postgres-provider";
import type { SqlQueryExecutor } from "./types";

type QueryExecutorFactory = () => SqlQueryExecutor;

const defaultQueryExecutorFactory: QueryExecutorFactory = () => {
  assertDatabaseConfigured();

  const connectionString = getConnectionString();

  if (getDbDriver() === "neon") {
    return createNeonQueryExecutor(connectionString);
  }

  return createNodePostgresQueryExecutor(connectionString);
};

let queryExecutorFactory: QueryExecutorFactory = defaultQueryExecutorFactory;

/** Creates the provider-appropriate one-shot SQL executor for Bun scripts. */
export function createSqlQueryExecutor(): SqlQueryExecutor {
  return queryExecutorFactory();
}

/** Restores the default query-executor seam for tests. */
export function resetSqlQueryExecutorFactoryForTesting(): void {
  queryExecutorFactory = defaultQueryExecutorFactory;
}

/** Overrides the query-executor seam for an isolated test module instance. */
export function setSqlQueryExecutorFactoryForTesting(
  factory: QueryExecutorFactory,
): void {
  queryExecutorFactory = factory;
}
