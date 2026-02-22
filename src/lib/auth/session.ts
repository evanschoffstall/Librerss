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
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = "librerss_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * CONFIG.SESSION_DURATION_DAYS;

const hashSessionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(":");

  if (!salt || !keyHex) return false;

  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(keyHex, "hex");

  if (derived.length !== stored.length) return false;

  return timingSafeEqual(derived, stored);
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function createSession(userId: number): Promise<string> {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    if (!RUNTIME_FLAGS.allowPlaceholderAuth) {
      throw new Error("Placeholder authentication is disabled");
    }

    if (userId !== PLACEHOLDER_ADMIN_USER.id) {
      throw new Error("Placeholder mode only supports the admin account");
    }

    return PLACEHOLDER_ADMIN_USER.sessionToken;
  }

  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Use transaction to ensure session limit is enforced
  await db.transaction(async (tx) => {
    // Get all sessions for this user, ordered by creation date (oldest first)
    const userSessions = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(asc(sessions.createdAt));

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

export async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  if (RUNTIME_FLAGS.usePlaceholderData) {
    if (!RUNTIME_FLAGS.allowPlaceholderAuth) {
      return null;
    }

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
