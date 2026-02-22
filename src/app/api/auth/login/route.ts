import { parseJsonBodyOrResponse } from "@/lib/api/request";
import {
  jsonError,
  logAndRespondError,
  requireMutableRequest,
} from "@/lib/api/route-helpers";
import { normalizeEmailInput } from "@/lib/auth/credentials";
import {
  createSession,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import { isValidEmail } from "@/lib/utils/validation";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

type LoginPayload = {
  email: string;
  password: string;
};

function parseLoginPayload(
  payload: Record<string, unknown>,
): LoginPayload | Response {
  const email = normalizeEmailInput(payload.email);
  const password = payload.password;

  if (!email || !isValidEmail(email)) {
    logger.warn("Login attempt with invalid email");
    return jsonError("A valid email is required", 400);
  }

  if (typeof password !== "string" || password.length === 0) {
    return jsonError("Password is required", 400);
  }

  if (password.length > CONFIG.PASSWORD_MAX_LENGTH) {
    return jsonError("Invalid email or password", 401);
  }

  return { email, password };
}

function respondInvalidCredentials(email?: string): Response {
  logger.warn("Failed placeholder login attempt", { email });
  return jsonError("Invalid email or password", 401);
}

async function handlePlaceholderLogin(
  email: string,
  password: string,
): Promise<Response> {
  if (!RUNTIME_FLAGS.allowPlaceholderAuth) {
    logger.warn("Login attempt when placeholder auth is disabled");
    return jsonError("Authentication is unavailable without a database", 503);
  }

  const isPlaceholderEmail = email === PLACEHOLDER_ADMIN_USER.email;
  const isValidPassword = await verifyPassword(
    password,
    PLACEHOLDER_ADMIN_USER.passwordHash,
  );

  if (!isPlaceholderEmail || !isValidPassword) {
    return respondInvalidCredentials(email);
  }

  const token = await createSession(PLACEHOLDER_ADMIN_USER.id);

  logger.info("Placeholder user logged in", { email });

  const response = NextResponse.json({
    user: {
      id: PLACEHOLDER_ADMIN_USER.id,
      email: PLACEHOLDER_ADMIN_USER.email,
    },
  });
  setSessionCookie(response, token);

  return response;
}

export async function POST(request: NextRequest) {
  try {
    const requestError = requireMutableRequest(request, {
      rateLimit: {
        key: "login",
        windowMs: CONFIG.RATE_LIMIT_LOGIN_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_LOGIN_MAX_ATTEMPTS,
      },
    });
    if (requestError) {
      return requestError;
    }

    const payloadOrResponse =
      await parseJsonBodyOrResponse<Record<string, unknown>>(request);
    if (payloadOrResponse instanceof Response) {
      return payloadOrResponse;
    }

    const parsedPayload = parseLoginPayload(payloadOrResponse);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }
    const { email, password } = parsedPayload;

    // Placeholder mode (dev/demo only)
    if (RUNTIME_FLAGS.usePlaceholderData) {
      return handlePlaceholderLogin(email, password);
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

    // SECURITY: Never auto-create users from the committed placeholder
    // credentials. Use /api/auth/signup or a seed script instead.
    //
    // SECURITY: Use a single generic log message for ALL login failures so
    // that log access cannot be used to enumerate registered email addresses.
    // Do not log the reason (email not found vs wrong password) — only log
    // the client identifier, which is already used for rate-limiting.
    if (!user) {
      logger.warn("Failed login attempt");
      return jsonError("Invalid email or password", 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      logger.warn("Failed login attempt");
      return jsonError("Invalid email or password", 401);
    }

    // Create session
    const token = await createSession(user.id);

    logger.info("User logged in successfully", {
      userId: user.id,
      email: user.email,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email },
    });
    setSessionCookie(response, token);

    return response;
  } catch (error) {
    return logAndRespondError("Login error", error);
  }
}
