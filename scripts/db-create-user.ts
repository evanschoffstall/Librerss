#!/usr/bin/env bun
/**
 * Creates a new LibreRSS user account.
 *
 * Usage:
 *   bun scripts/create-user.ts <email> <password>
 *   bun run create-user <email> <password>.
 */

import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

import { createSqlQueryExecutor } from "../src/lib/db/query-executor";

const scrypt = promisify(scryptCallback);

const [email, password] = process.argv.slice(2);

if (!email || !email.includes("@")) {
  console.error("Usage: bun scripts/create-user.ts <email> <password>");
  process.exit(1);
}

if (!password || password.length < 8) {
  console.error("ERROR: Password must be at least 8 characters.");
  process.exit(1);
}

/**
 * Process the ensure database url.
 */
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

/**
 * Process the hash password.
 * @param pw - The pw.
 * @returns The hash password.
 */
async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(pw, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

/**
 * Process the main.
 */
async function main(): Promise<void> {
  ensureDatabaseUrl();
  const db = createSqlQueryExecutor();

  try {
    const existing = await db.query<{ id: number }>(
      `SELECT id FROM "User" WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      console.error(`ERROR: An account with ${email} already exists.`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);

    const result = await db.query<{ email: string; id: number }>(
      `INSERT INTO "User" (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
      [email.toLowerCase(), passwordHash],
    );

    const user = result.rows[0];
    console.log(`Created user: ${user.email} (id: ${user.id})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  } finally {
    await db.close();
  }
}

await main();
