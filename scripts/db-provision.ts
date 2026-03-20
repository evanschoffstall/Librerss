#!/usr/bin/env bun
/**
 * Provisions the LibreRSS database from scratch.
 *
 * Usage:
 *   bun run db:provision
 *
 * What it does:
 *   1. Validates DATABASE_URL is set
 *   2. Verifies the database connection
 *   3. Pushes the Drizzle schema (creates/migrates all tables)
 */

import { execSync } from "node:child_process";

import { createSqlQueryExecutor } from "../src/lib/db/query-executor";

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) {
    return;
  }

  console.error(
    "ERROR: DATABASE_URL is not set.\n" +
      "Create a .env.local file with:\n\n" +
      '  DATABASE_URL="postgres://user:password@host:5432/dbname"\n',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  ensureDatabaseUrl();

  console.log("Connecting to database...");

  const db = createSqlQueryExecutor();

  try {
    const result = await db.query<{ version: string }>("SELECT version()");
    const version: string = result.rows[0]?.version ?? "unknown";
    console.log(
      `Connected. PostgreSQL: ${version.split(" ").slice(0, 2).join(" ")}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: Could not connect to database.\n${message}`);
    process.exit(1);
  } finally {
    await db.close();
  }

  console.log("Pushing schema...");

  try {
    execSync("bunx drizzle-kit push", {
      env: { ...process.env },
      stdio: "inherit",
    });
  } catch {
    console.error("ERROR: Schema push failed.");
    process.exit(1);
  }

  console.log("Done. Database provisioned successfully.");
}

await main();
