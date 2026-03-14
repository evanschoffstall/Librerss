import { getConnectionString, getDbDriver } from "./config";
import { createNeonQueryExecutor } from "./neon-provider";
import { createNodePostgresQueryExecutor } from "./node-postgres-provider";
import type { SqlQueryExecutor } from "./types";

type QueryExecutorFactory = () => SqlQueryExecutor;

const defaultQueryExecutorFactory: QueryExecutorFactory = () => {
  const connectionString = getConnectionString();

  return getDbDriver() === "neon"
    ? createNeonQueryExecutor(connectionString)
    : createNodePostgresQueryExecutor(connectionString);
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
