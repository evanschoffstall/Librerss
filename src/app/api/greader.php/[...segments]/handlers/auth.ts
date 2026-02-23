import { parseFormOrQueryParams, parseJsonBody } from "@/lib/api/request";
import {
  parseEmailPasswordFromRecord,
  parseEmailPasswordFromSearchParams,
} from "@/lib/auth/credentials";
import { requireSameOrigin } from "@/lib/auth/csrf";
import {
  createSession,
  getUserFromRequest,
  getUserFromSessionToken,
  SESSION_COOKIE_NAME,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { rateLimiter } from "@/lib/utils/rate-limit";
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
): Promise<ClientLoginPayload | Response | null> {
  const urlPayload = parseClientLoginParams(new URL(request.url).searchParams);
  if (urlPayload) {
    return urlPayload;
  }

  if (request.method !== "POST") {
    return null;
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = await parseFormOrQueryParams(request);
    if (params instanceof Response) {
      return params;
    }

    return parseClientLoginParams(params);
  }

  if (contentType.includes("multipart/form-data")) {
    const params = await parseFormOrQueryParams(request);
    if (params instanceof Response) {
      return params;
    }

    return parseClientLoginParams(params);
  }

  if (contentType.includes("application/json")) {
    const parsed = await parseJsonBody<Record<string, unknown>>(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    return parseEmailPasswordFromRecord(parsed.data, {
      emailKeys: ["Email", "email", "username"],
      passwordKeys: ["Passwd", "password", "passwd"],
    });
  }

  const params = await parseFormOrQueryParams(request);
  if (params instanceof Response) {
    return params;
  }

  return parseClientLoginParams(params);
}

export async function handleClientLogin(
  request: NextRequest,
): Promise<Response> {
  // Rate-limit ClientLogin to prevent credential brute-forcing.
  const rateLimitError = rateLimiter.check(request, "greader-login", {
    windowMs: CONFIG.RATE_LIMIT_LOGIN_WINDOW_MS,
    maxAttempts: CONFIG.RATE_LIMIT_LOGIN_MAX_ATTEMPTS,
  });
  if (rateLimitError) {
    return textResponse("Error=RateLimited\n", 429);
  }

  const payload = await parseClientLoginPayload(request);

  if (payload instanceof Response) {
    if (payload.status === 413) {
      return textResponse("Error=RequestTooLarge\n", 413);
    }

    return textResponse("Error=BadAuthentication\n", 400);
  }

  if (!payload) {
    return textResponse("Error=BadAuthentication\n", 400);
  }

  // SECURITY: Cap password length to prevent scrypt DoS — matches the
  // protection applied in the regular /api/auth/login route.
  if (payload.password.length > CONFIG.PASSWORD_MAX_LENGTH) {
    return textResponse("Error=BadAuthentication\n", 403);
  }

  if (RUNTIME_FLAGS.usePlaceholderData) {
    const isValidEmail = payload.email === PLACEHOLDER_ADMIN_USER.email;
    const isValidPassword = await verifyPassword(
      payload.password,
      PLACEHOLDER_ADMIN_USER.passwordHash,
    );

    if (!isValidEmail || !isValidPassword) {
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

function extractAuthToken(request: NextRequest): string | null {
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

export async function requireGReaderMutableUser(
  request: NextRequest,
): Promise<SessionUser | Response> {
  const hasExplicitToken = Boolean(extractAuthToken(request));
  const hasSessionCookie = Boolean(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  // CSRF protection for cookie-authenticated mutations:
  // - Browser cross-site requests automatically include cookies.
  // - They cannot add Authorization headers.
  // - Therefore require same-origin when no explicit token is supplied.
  if (hasSessionCookie && !hasExplicitToken) {
    const sameOriginError = requireSameOrigin(request);
    if (sameOriginError) {
      return sameOriginError;
    }
  }

  return requireGReaderUser(request);
}
