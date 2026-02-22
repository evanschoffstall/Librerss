import {
  parseEmailPasswordFromFormData,
  parseEmailPasswordFromRecord,
  parseEmailPasswordFromSearchParams,
} from "@/lib/auth/credentials";
import {
  createSession,
  getUserFromRequest,
  getUserFromSessionToken,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth/session";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GOOGLE_LOGIN_PREFIX } from "../constants";
import { textResponse } from "../utils/responses";

type ClientLoginPayload = {
  email: string;
  password: string;
};

function parseClientLoginParams(
  searchParams: URLSearchParams,
): ClientLoginPayload | null {
  return parseEmailPasswordFromSearchParams(searchParams, {
    emailKeys: ["Email", "email", "username"],
    passwordKeys: ["Passwd", "password", "passwd"],
  });
}

async function parseClientLoginPayload(
  request: NextRequest,
): Promise<ClientLoginPayload | null> {
  const urlPayload = parseClientLoginParams(new URL(request.url).searchParams);
  if (urlPayload) {
    return urlPayload;
  }

  if (request.method !== "POST") {
    return null;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return parseEmailPasswordFromFormData(form, {
      emailKeys: ["Email", "email", "username"],
      passwordKeys: ["Passwd", "password", "passwd"],
    });
  }

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return null;
  }

  const parsed = parseClientLoginParams(new URLSearchParams(rawBody));
  if (parsed) {
    return parsed;
  }

  try {
    const json = JSON.parse(rawBody) as Record<string, unknown>;
    return parseEmailPasswordFromRecord(json, {
      emailKeys: ["Email", "email", "username"],
      passwordKeys: ["Passwd", "password", "passwd"],
    });
  } catch {
    return null;
  }
}

export async function handleClientLogin(
  request: NextRequest,
): Promise<Response> {
  const payload = await parseClientLoginPayload(request);

  if (!payload) {
    return textResponse("Error=BadAuthentication\n", 400);
  }

  if (RUNTIME_FLAGS.usePlaceholderData) {
    const isValidEmail = payload.email === PLACEHOLDER_ADMIN_USER.email;
    const isValidPassword = await verifyPassword(
      payload.password,
      PLACEHOLDER_ADMIN_USER.passwordHash,
    );

    if (
      !RUNTIME_FLAGS.allowPlaceholderAuth ||
      !isValidEmail ||
      !isValidPassword
    ) {
      return textResponse("Error=BadAuthentication\n", 403);
    }

    const token = await createSession(PLACEHOLDER_ADMIN_USER.id);

    return textResponse(`SID=${token}\nLSID=${token}\nAuth=${token}\n`);
  }

  const db = getDb();

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, payload.email))
    .limit(1);

  if (!user) {
    return textResponse("Error=BadAuthentication\n", 403);
  }

  const isValidPassword = await verifyPassword(
    payload.password,
    user.passwordHash,
  );
  if (!isValidPassword) {
    return textResponse("Error=BadAuthentication\n", 403);
  }

  const token = await createSession(user.id);
  return textResponse(`SID=${token}\nLSID=${token}\nAuth=${token}\n`);
}

export function extractAuthToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization")?.trim();

  if (authorization) {
    const normalized = authorization.toLowerCase();

    if (normalized.startsWith(GOOGLE_LOGIN_PREFIX)) {
      return authorization.slice(GOOGLE_LOGIN_PREFIX.length).trim() || null;
    }

    if (normalized.startsWith("bearer ")) {
      return authorization.slice("bearer ".length).trim() || null;
    }
  }

  const searchParams = new URL(request.url).searchParams;

  return (
    searchParams.get("auth") ??
    searchParams.get("Auth") ??
    searchParams.get("T") ??
    null
  );
}

export async function requireGReaderUser(
  request: NextRequest,
): Promise<SessionUser | Response> {
  const cookieUser = await getUserFromRequest(request);
  if (cookieUser) {
    return cookieUser;
  }

  const token = extractAuthToken(request);
  if (!token) {
    return textResponse("Unauthorized\n", 401);
  }

  const tokenUser = await getUserFromSessionToken(token);
  if (!tokenUser) {
    return textResponse("Unauthorized\n", 401);
  }

  return tokenUser;
}
