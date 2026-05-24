#!/usr/bin/env bun
/**
 * Creates a new LibreRSS user account.
 *
 * Usage:
 *   bun scripts/create-user.ts <email> <password>
 *   bun run create-user <email> <password>.
 *
 * The script prompts whether the new account should receive admin
 * permissions for invitation management.
 */

import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

import { createSqlQueryExecutor } from "../src/lib/db/query-executor";

const scrypt = promisify(scryptCallback);

/**
 * Parses an interactive admin-prompt response.
 * @param answer - The raw answer entered by the operator.
 * @returns True for yes, false for no or blank, and null for invalid input.
 */
export function parseAdminPromptAnswer(answer: string): boolean | null {
  const normalizedAnswer = answer.trim().toLowerCase();
  if (!normalizedAnswer) {
    return false;
  }

  if (["y", "yes"].includes(normalizedAnswer)) {
    return true;
  }

  if (["n", "no"].includes(normalizedAnswer)) {
    return false;
  }

  return null;
}

/**
 * Prompts the operator to decide whether the new user should be an admin.
 * @returns Whether the created user should receive admin permissions.
 */
export async function promptForAdminStatus(): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const answer = await readline.question(
        "Grant admin permissions to this user? [y/N]: ",
      );
      const parsedAnswer = parseAdminPromptAnswer(answer);

      if (parsedAnswer !== null) {
        return parsedAnswer;
      }

      console.error("ERROR: Please answer yes or no.");
    }
  } finally {
    readline.close();
  }
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
  const { email, password } = resolveCliArguments();
  const db = createSqlQueryExecutor();

  try {
    const isAdmin = await promptForAdminStatus();
    const existing = await db.query<{ id: number }>(
      `SELECT id FROM "User" WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      console.error(`ERROR: An account with ${email} already exists.`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);

    const result = await db.query<{
      email: string;
      id: number;
      is_admin: boolean;
    }>(
      `INSERT INTO "User" (email, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, email, is_admin`,
      [email.toLowerCase(), passwordHash, isAdmin],
    );

    const user = result.rows[0];
    console.log(
      `Created user: ${user.email} (id: ${user.id}, admin: ${user.is_admin ? "yes" : "no"})`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  } finally {
    await db.close();
  }
}

/**
 * Resolves and validates the CLI email/password arguments.
 * @returns The normalized CLI arguments.
 */
function resolveCliArguments(): { email: string; password: string } {
  const [email, password] = process.argv.slice(2);

  if (!email || !email.includes("@")) {
    console.error("Usage: bun scripts/create-user.ts <email> <password>");
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error("ERROR: Password must be at least 8 characters.");
    process.exit(1);
  }

  return { email, password };
}

if (import.meta.main) {
  await main();
}
