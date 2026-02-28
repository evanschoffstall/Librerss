import { parseJsonBodyOrResponse } from "@/lib/api/http";
import { jsonError } from "@/lib/api/http";
import {
  logAndRespondError,
  requireMutableRequest,
} from "@/lib/server";
import { normalizeEmailInput } from "@/lib/auth/credentials";
import {
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { isStrongPassword, isValidEmail } from "@/lib/utils/validation";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

type SignupPayload = {
  email: string;
  password: string;
};

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "23505";
}

function parseSignupPayload(
  payload: Record<string, unknown>,
): SignupPayload | Response {
  const email = normalizeEmailInput(payload.email);
  const password = payload.password;

  if (!email || !isValidEmail(email)) {
    logger.warn("Signup attempt with invalid email", {
      email: email ? "provided" : "missing",
    });
    return jsonError("A valid email is required", 400);
  }

  if (typeof password !== "string" || !isStrongPassword(password)) {
    logger.warn("Signup attempt with weak password", { email });
    return jsonError(
      `Password must be at least ${CONFIG.PASSWORD_MIN_LENGTH} characters and include at least 3 of: uppercase letter, lowercase letter, number, special character`,
      400,
    );
  }

  return { email, password };
}

export async function POST(request: NextRequest) {
  try {
    const requestError = requireMutableRequest(request, {
      rateLimit: {
        key: "signup",
        windowMs: CONFIG.RATE_LIMIT_SIGNUP_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_SIGNUP_MAX_ATTEMPTS,
      },
    });
    if (requestError) {
      return requestError;
    }

    if (!RUNTIME_FLAGS.allowSignup) {
      logger.warn("Signup attempt when signup is disabled");
      return jsonError("Signup is disabled by server configuration", 403);
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      logger.warn("Signup attempt when using placeholder data");
      return jsonError(
        "Signup is disabled when DATABASE_URL is not configured",
        503,
      );
    }

    const db = getDb();

    const payloadOrResponse =
      await parseJsonBodyOrResponse<Record<string, unknown>>(request);
    if (payloadOrResponse instanceof Response) {
      return payloadOrResponse;
    }

    const parsedPayload = parseSignupPayload(payloadOrResponse);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }
    const { email, password } = parsedPayload;

    // Check for existing user
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      logger.warn("Signup attempt with existing email", { email });
      // Don't reveal that email exists (prevents enumeration)
      return jsonError(
        "Unable to create account. Please try a different email or contact support.",
        400,
      );
    }

    // Create user
    const passwordHash = await hashPassword(password);

    const [createdUser] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email });

    if (!createdUser) {
      logger.error("Failed to create user during signup", { email });
      return jsonError("Failed to create account", 500);
    }

    // Create session
    const token = await createSession(createdUser.id);

    logger.info("User signed up successfully", {
      userId: createdUser.id,
      email: createdUser.email,
    });

    const response = NextResponse.json({ user: createdUser }, { status: 201 });
    setSessionCookie(response, token);

    return response;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      logger.warn("Signup attempt with existing email");
      return jsonError(
        "Unable to create account. Please try a different email or contact support.",
        400,
      );
    }

    return logAndRespondError("Signup error", error);
  }
}
