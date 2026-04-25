import { defineConfig } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";

import { normalizePostgresConnectionString } from "./src/lib/db/connection-string";

/**
 * Reads the database URL from a dotenv file without loading the whole file into
 * process.env.
 * @param filePath - Dotenv file path to scan for a DATABASE_URL entry.
 * @returns The unquoted DATABASE_URL value when present.
 */
function readDatabaseUrlFromEnvFile(filePath: string): null | string {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf8");
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("DATABASE_URL="));

  if (!line) return null;

  const rawValue = line.slice("DATABASE_URL=".length).trim();
  if (!rawValue) return null;

  return rawValue.replace(/^['"]|['"]$/g, "");
}

/**
 * Resolves the database connection string Drizzle should use for schema
 * generation and migrations.
 * @returns The normalized PostgreSQL connection string.
 */
function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl && !envUrl.includes("@host:")) {
    return normalizePostgresConnectionString(envUrl);
  }

  const resolvedDatabaseUrl =
    readDatabaseUrlFromEnvFile(".env.local") ??
    readDatabaseUrlFromEnvFile(".env") ??
    envUrl ??
    "";

  return normalizePostgresConnectionString(resolvedDatabaseUrl);
}

export default defineConfig({
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
});
