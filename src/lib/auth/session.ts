import type { NextRequest, NextResponse } from "next/server";

import { and, asc, eq, gt, inArray } from "drizzle-orm";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  type ScryptOptions,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import { CONFIG } from "@/lib/config";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { sessions, users } from "@/lib/db/schema";

// Re-type the promisify wrapper to include the optional options parameter that
// @types/node does not expose through the standard promisify overloads.
const scrypt = promisify(scryptCallback) as (
  password: Buffer | string,
  salt: Buffer | string,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

export const SESSION_COOKIE_NAME = "librerss_session";

export interface SessionUser {
  email: string;
  expiresAt: Date;
  sessionId: number;
  userId: number;
}

function getBaseCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

/** Lazily resolved so the env read happens at call time, not at module load. */
function getSessionDurationMs() {
  return 1000 * 60 * 60 * 24 * CONFIG.SESSION_DURATION_DAYS;
}

const hashSessionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

// SECURITY: scrypt cost parameters — versioned so stored hashes remain
// verifiable after a future cost-factor upgrade.
//
// V1 (legacy): the Node.js default, N=16384.  Hash format: "<salt>:<hex>".
//   Any hash created before this versioning scheme was introduced.
// V2 (current): same N as V1 but stored with the "v2:" prefix to establish
//   the upgrade-path infrastructure.  Once the test runner migrates fully to
//   Node.js (rather than Bun's OpenSSL which caps memory at ~16 MB), bump
//   SCRYPT_V2 to { N: 32768, r: 8, p: 1 } and this format will carry the
//   new params automatically without requiring a migration.
//
// New passwords are always hashed with V2.  verifyPassword detects the format
// and falls back to V1 params automatically, so no DB migration is needed and
// existing users' passwords continue to work.
const SCRYPT_V1 = { N: 16384, p: 1, r: 8 } as const; // legacy (read-only)
const SCRYPT_V2 = { N: 16384, p: 1, r: 8 } as const; // current — bump N when runtime allows

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getBaseCookieOptions(),
    expires: new Date(0),
  });
}

export async function createSession(userId: number): Promise<string> {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    if (userId !== PLACEHOLDER_ADMIN_USER.id) {
      throw new Error("Placeholder mode only supports the admin account");
    }

    return PLACEHOLDER_ADMIN_USER.sessionToken;
  }

  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + getSessionDurationMs());

  // Use transaction to ensure session limit is enforced.
  // SELECT FOR UPDATE serializes concurrent logins for the same user so each
  // transaction sees a consistent session count before inserting a new row.
  // Without this two simultaneous logins can both read count = N-1, skip
  // deletion, and insert — leaving N+1 sessions until the next login cleans up.
  await db.transaction(async (tx) => {
    // Lock all existing sessions for this user before reading their count.
    const userSessions = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(asc(sessions.createdAt))
      .for("update");

    // If user has too many sessions, delete the oldest ones
    const maxSessionsPerUser = CONFIG.MAX_SESSIONS_PER_USER;

    if (userSessions.length >= maxSessionsPerUser) {
      const idsToDelete = userSessions
        .slice(0, userSessions.length - maxSessionsPerUser + 1)
        .map((s) => s.id);

      await tx.delete(sessions).where(inArray(sessions.id, idsToDelete));
    }

    // Create new session
    await tx.insert(sessions).values({ expiresAt, tokenHash, userId });
  });

  return token;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    return;
  }

  const db = getDb();
  const tokenHash = hashSessionToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return getUserFromSessionToken(token);
}

export async function getUserFromSessionToken(
  token: string,
): Promise<null | SessionUser> {
  if (!token) {
    return null;
  }

  if (RUNTIME_FLAGS.usePlaceholderData) {
    if (token !== PLACEHOLDER_ADMIN_USER.sessionToken) {
      return null;
    }

    return {
      email: PLACEHOLDER_ADMIN_USER.email,
      expiresAt: new Date(Date.now() + getSessionDurationMs()),
      sessionId: 0,
      userId: PLACEHOLDER_ADMIN_USER.id,
    };
  }

  const db = getDb();
  const tokenHash = hashSessionToken(token);

  const activeSessions = await db
    .select({
      email: users.email,
      expiresAt: sessions.expiresAt,
      sessionId: sessions.id,
      userId: users.id,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return activeSessions[0] ?? null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, SCRYPT_V2);
  return `v2:${salt}:${key.toString("hex")}`;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...getBaseCookieOptions(),
    maxAge: getSessionDurationMs() / 1000,
  });
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  // Detect hash version from the format prefix.
  const isV2 = storedHash.startsWith("v2:");
  const stripped = isV2 ? storedHash.slice(3) : storedHash;
  const params = isV2 ? SCRYPT_V2 : SCRYPT_V1;

  const [salt, keyHex] = stripped.split(":");
  if (!salt || !keyHex) return false;

  const derived = await scrypt(password, salt, 64, params);
  const stored = Buffer.from(keyHex, "hex");

  if (derived.length !== stored.length) return false;

  return timingSafeEqual(derived, stored);
}

// ── Shared credential authentication ─────────────────────────────────────────

/**
 * Authenticate a user by email and password, returning a fresh session token
 * on success. Shared by the authentication routes so that security measures
 * (scrypt params, placeholder-mode checks) stay in a single code path.
 */
// SECURITY: constant-time dummy hash — used when the email is not found so
// that verifyPassword always runs, preventing timing-based email enumeration.
const DUMMY_HASH =
  "v2:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export async function authenticateCredentials(
  email: string,
  password: string,
): Promise<
  { email: string; ok: true; token: string; userId: number } | { ok: false }
> {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    if (email !== PLACEHOLDER_ADMIN_USER.email) {
      return { ok: false };
    }

    const isValid = await verifyPassword(
      password,
      PLACEHOLDER_ADMIN_USER.passwordHash,
    );
    if (!isValid) {
      return { ok: false };
    }

    const token = await createSession(PLACEHOLDER_ADMIN_USER.id);
    return {
      email: PLACEHOLDER_ADMIN_USER.email,
      ok: true,
      token,
      userId: PLACEHOLDER_ADMIN_USER.id,
    };
  }

  const db = getDb();

  const usersByEmail = await db
    .select({
      email: users.email,
      id: users.id,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Always call verifyPassword — even when the user is not found — to prevent
  // timing-based email enumeration via response-time measurement.
  const hashToVerify =
    usersByEmail.length === 0 ? DUMMY_HASH : usersByEmail[0].passwordHash;
  const isValid = await verifyPassword(password, hashToVerify);

  if (usersByEmail.length === 0 || !isValid) {
    return { ok: false };
  }

  const user = usersByEmail[0];

  const token = await createSession(user.id);
  return { email: user.email, ok: true, token, userId: user.id };
}
