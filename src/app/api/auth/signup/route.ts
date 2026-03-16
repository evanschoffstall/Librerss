import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { LEGAL_CONSENT_VERSION } from "@/app/components/legal/metadata";
import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { normalizeEmailInput } from "@/lib/auth/credentials";
import {
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb, isUniqueConstraintError } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { logAndRespondError, requireMutableRequest } from "@/lib/server";
import { isStrongPassword, isValidEmail } from "@/lib/utils/validation";

interface SignupPayload {
  acceptedLegalVersion: string;
  email: string;
  password: string;
}

interface SignupRouteDeps {
  createSessionFn?: typeof createSession;
  getDbFn?: () => unknown;
  hashPasswordFn?: typeof hashPassword;
  isUniqueConstraintErrorFn?: typeof isUniqueConstraintError;
  logAndRespondErrorFn?: typeof logAndRespondError;
  logger?: Pick<typeof logger, "error" | "info" | "warn">;
  requireMutableRequestFn?: typeof requireMutableRequest;
  runtimeFlags?: Pick<typeof RUNTIME_FLAGS, "allowSignup" | "usePlaceholderData">;
  setSessionCookieFn?: typeof setSessionCookie;
}

export async function POST(request: NextRequest, deps: SignupRouteDeps = {}) {
  const appLogger = deps.logger ?? logger;
  const requireRequest = deps.requireMutableRequestFn ?? requireMutableRequest;
  const runtimeFlags = deps.runtimeFlags ?? RUNTIME_FLAGS;
  try {
    const requestError = requireRequest(request, {
      rateLimit: {
        key: "signup",
        maxAttempts: CONFIG.RATE_LIMIT_SIGNUP_MAX_ATTEMPTS,
        windowMs: CONFIG.RATE_LIMIT_SIGNUP_WINDOW_MS,
      },
    });
    if (requestError) {
      return requestError;
    }

    if (!runtimeFlags.allowSignup) {
      appLogger.warn("Signup attempt when signup is disabled");
      return jsonError("Signup is disabled by server configuration", 403);
    }

    if (runtimeFlags.usePlaceholderData) {
      appLogger.warn("Signup attempt when using placeholder data");
      return jsonError(
        "Signup is disabled when DATABASE_URL is not configured",
        503,
      );
    }

    const db = ((deps.getDbFn?.() ?? getDb()) as Pick<
      ReturnType<typeof getDb>,
      "insert" | "select"
    >);

    const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (payloadOrResponse instanceof Response) {
      return payloadOrResponse;
    }

    const parsedPayload = parseSignupPayload(payloadOrResponse);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }
    const { acceptedLegalVersion, email, password } = parsedPayload;

    // Check for existing user
    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUsers.length > 0) {
      appLogger.warn("Signup attempt with existing email", { email });
      // Don't reveal that email exists (prevents enumeration)
      return jsonError(
        "Unable to create account. Please try a different email or contact support.",
        400,
      );
    }

    // Create user
    const passwordHash = await (deps.hashPasswordFn ?? hashPassword)(password);

    const createdUsers = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ email: users.email, id: users.id });

    if (createdUsers.length === 0) {
      appLogger.error("Failed to create user during signup", { email });
      return jsonError("Failed to create account", 500);
    }
    const createdUser = createdUsers[0];

    // Create session
    const token = await (deps.createSessionFn ?? createSession)(createdUser.id);

    appLogger.info("User signed up successfully", {
      acceptedLegalVersion,
      email: createdUser.email,
      userId: createdUser.id,
    });

    const response = NextResponse.json({ user: createdUser }, { status: 201 });
    (deps.setSessionCookieFn ?? setSessionCookie)(response, token);

    return response;
  } catch (error) {
    if ((deps.isUniqueConstraintErrorFn ?? isUniqueConstraintError)(error)) {
      appLogger.warn("Signup attempt with existing email");
      return jsonError(
        "Unable to create account. Please try a different email or contact support.",
        400,
      );
    }

    return (deps.logAndRespondErrorFn ?? logAndRespondError)(
      "Signup error",
      error,
    );
  }
}

function parseSignupPayload(
  payload: Record<string, unknown>,
): Response | SignupPayload {
  const acceptedLegalVersion = payload.acceptedLegalVersion;
  const email = normalizeEmailInput(payload.email);
  const password = payload.password;

  if (acceptedLegalVersion !== LEGAL_CONSENT_VERSION) {
    logger.warn("Signup attempt without current legal acceptance", {
      acceptedLegalVersion:
        typeof acceptedLegalVersion === "string"
          ? acceptedLegalVersion
          : "missing",
    });
    return jsonError(
      "You must accept the current privacy policy and terms for this deployment before creating an account.",
      400,
    );
  }

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

  return { acceptedLegalVersion, email, password };
}
