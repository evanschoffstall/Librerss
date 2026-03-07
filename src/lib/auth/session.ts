import { CONFIG } from "@/lib/config";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { sessions, users } from "@/lib/db/schema";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// Re-type the promisify wrapper to include the optional options parameter that
// @types/node does not expose through the standard promisify overloads.
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

export const SESSION_COOKIE_NAME = "librerss_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * CONFIG.SESSION_DURATION_DAYS;

export type SessionUser = {
  sessionId: number;
  userId: number;
  email: string;
  expiresAt: Date;
};

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
const SCRYPT_V1 = { N: 16384, r: 8, p: 1 } as const; // legacy (read-only)
const SCRYPT_V2 = { N: 16384, r: 8, p: 1 } as const; // current — bump N when runtime allows

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64, SCRYPT_V2)) as Buffer;
  return `v2:${salt}:${key.toString("hex")}`;
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

  const derived = (await scrypt(password, salt, 64, params)) as Buffer;
  const stored = Buffer.from(keyHex, "hex");

  if (derived.length !== stored.length) return false;

  return timingSafeEqual(derived, stored);
}

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions,
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...baseCookieOptions,
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
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

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
    if (userSessions.length >= CONFIG.MAX_SESSIONS_PER_USER) {
      const idsToDelete = userSessions
        .slice(0, userSessions.length - CONFIG.MAX_SESSIONS_PER_USER + 1)
        .map((s) => s.id);

      await tx.delete(sessions).where(inArray(sessions.id, idsToDelete));
    }

    // Create new session
    await tx.insert(sessions).values({ userId, tokenHash, expiresAt });
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

export async function getUserFromSessionToken(
  token: string,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  if (RUNTIME_FLAGS.usePlaceholderData) {
    if (token !== PLACEHOLDER_ADMIN_USER.sessionToken) {
      return null;
    }

    return {
      sessionId: 0,
      userId: PLACEHOLDER_ADMIN_USER.id,
      email: PLACEHOLDER_ADMIN_USER.email,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    };
  }

  const db = getDb();
  const tokenHash = hashSessionToken(token);

  const [activeSession] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      expiresAt: sessions.expiresAt,
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

  return activeSession ?? null;
}

export async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return getUserFromSessionToken(token);
}

// ── Shared credential authentication ─────────────────────────────────────────

/**
 * Authenticate a user by email and password, returning a fresh session token
 * on success.  Shared by both the regular `/api/auth/login` route and the
 * GReader `ClientLogin` endpoint so that security measures (scrypt params,
 * placeholder-mode checks) stay in a single code path.
 */
// SECURITY: constant-time dummy hash — used when the email is not found so
// that verifyPassword always runs, preventing timing-based email enumeration.
const DUMMY_HASH =
  "v2:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export async function authenticateCredentials(
  email: string,
  password: string,
): Promise<
  { ok: true; userId: number; email: string; token: string } | { ok: false }
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
      ok: true,
      userId: PLACEHOLDER_ADMIN_USER.id,
      email: PLACEHOLDER_ADMIN_USER.email,
      token,
    };
  }

  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Always call verifyPassword — even when the user is not found — to prevent
  // timing-based email enumeration via response-time measurement.
  const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
  const isValid = await verifyPassword(password, hashToVerify);

  if (!user || !isValid) {
    return { ok: false };
  }

  const token = await createSession(user.id);
  return { ok: true, userId: user.id, email: user.email, token };
}
