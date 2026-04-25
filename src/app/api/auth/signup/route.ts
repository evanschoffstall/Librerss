import type { NextRequest } from "next/server";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { CONFIG, LEGAL_CONSENT_VERSION, logger } from "@/lib";
import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import {
  createSession,
  hashPassword,
  normalizeEmailInput,
  setSessionCookie,
} from "@/lib/auth";
import { RUNTIME_FLAGS } from "@/lib/core/placeholder";
import { getDb, isUniqueConstraintError, users } from "@/lib/db";
import { serverApi } from "@/lib/server";
import { isStrongPassword, isValidEmail } from "@/lib/utils";

interface ResolvedSignupRouteDeps {
  appLogger: Pick<typeof logger, "error" | "info" | "warn">;
  createSessionFn: typeof createSession;
  getDbFn: typeof getDb;
  hashPasswordFn: typeof hashPassword;
  isUniqueConstraintErrorFn: typeof isUniqueConstraintError;
  logAndRespondErrorFn: typeof serverApi.logAndRespondError;
  requireMutableRequestFn: typeof serverApi.requireMutableRequest;
  runtimeFlags: Pick<
    typeof RUNTIME_FLAGS,
    "allowSignup" | "usePlaceholderData"
  >;
  setSessionCookieFn: typeof setSessionCookie;
}

type SignupDb = Pick<ReturnType<typeof getDb>, "insert" | "select">;

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
  logAndRespondErrorFn?: typeof serverApi.logAndRespondError;
  logger?: Pick<typeof logger, "error" | "info" | "warn">;
  requireMutableRequestFn?: typeof serverApi.requireMutableRequest;
  runtimeFlags?: Pick<
    typeof RUNTIME_FLAGS,
    "allowSignup" | "usePlaceholderData"
  >;
  setSessionCookieFn?: typeof setSessionCookie;
}

/**
 * Render the post component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered post component.
 */
export async function POST(
  request: NextRequest,
  depsOrContext: serverApi.RouteHandlerContext | SignupRouteDeps = {},
) {
  const deps =
    serverApi.resolveRouteHandlerDeps<SignupRouteDeps>(depsOrContext);
  const resolvedDeps = resolveSignupRouteDeps(deps);

  try {
    const requestError = resolveSignupRequestError(request, resolvedDeps);
    if (requestError) {
      return requestError;
    }

    const availabilityError = resolveSignupAvailabilityError(resolvedDeps);
    if (availabilityError) {
      return availabilityError;
    }

    const db = resolvedDeps.getDbFn() as SignupDb;
    const parsedPayload = await resolveSignupPayload(request);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }

    const existingUserError = await resolveExistingUserError(
      db,
      parsedPayload.email,
      resolvedDeps.appLogger,
    );
    if (existingUserError) {
      return existingUserError;
    }

    return await createSignupSuccessResponse(db, parsedPayload, resolvedDeps);
  } catch (error) {
    if (resolvedDeps.isUniqueConstraintErrorFn(error)) {
      resolvedDeps.appLogger.warn("Signup attempt with existing email");
      return jsonError(
        "Unable to create account. Please try a different email or contact support.",
        400,
      );
    }

    return resolvedDeps.logAndRespondErrorFn("Signup error", error);
  }
}

/**
 * Create the signup success response.
 * @param db - The db.
 * @param payload - The payload.
 * @param deps - The deps.
 * @returns The signup success response.
 */
async function createSignupSuccessResponse(
  db: SignupDb,
  payload: SignupPayload,
  deps: ResolvedSignupRouteDeps,
): Promise<Response> {
  const passwordHash = await deps.hashPasswordFn(payload.password);
  const createdUsers = await db
    .insert(users)
    .values({ email: payload.email, passwordHash })
    .returning({ email: users.email, id: users.id });

  if (createdUsers.length === 0) {
    deps.appLogger.error("Failed to create user during signup", {
      email: payload.email,
    });
    return jsonError("Failed to create account", 500);
  }

  const createdUser = createdUsers[0];

  const token = await deps.createSessionFn(createdUser.id);
  deps.appLogger.info("User signed up successfully", {
    acceptedLegalVersion: payload.acceptedLegalVersion,
    email: createdUser.email,
    userId: createdUser.id,
  });

  const response = NextResponse.json({ user: createdUser }, { status: 201 });
  deps.setSessionCookieFn(response, token);
  return response;
}

/**
 * Parse the signup payload.
 * @param payload - The payload.
 * @returns The signup payload.
 */
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

/**
 * Resolve the existing user error.
 * @param db - The db.
 * @param email - The email.
 * @param appLogger - The app logger.
 * @returns The existing user error.
 */
async function resolveExistingUserError(
  db: SignupDb,
  email: string,
  appLogger: ResolvedSignupRouteDeps["appLogger"],
): Promise<null | Response> {
  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUsers.length === 0) {
    return null;
  }

  appLogger.warn("Signup attempt with existing email", { email });
  return jsonError(
    "Unable to create account. Please try a different email or contact support.",
    400,
  );
}

/**
 * Resolve the signup availability error.
 * @param deps - The deps.
 * @returns The signup availability error.
 */
function resolveSignupAvailabilityError(
  deps: ResolvedSignupRouteDeps,
): null | Response {
  if (!deps.runtimeFlags.allowSignup) {
    deps.appLogger.warn("Signup attempt when signup is disabled");
    return jsonError("Signup is disabled by server configuration", 403);
  }

  if (!deps.runtimeFlags.usePlaceholderData) {
    return null;
  }

  deps.appLogger.warn("Signup attempt when using placeholder data");
  return jsonError(
    "Signup is disabled when DATABASE_URL is not configured",
    503,
  );
}

/**
 * Resolve the signup payload.
 * @param request - The request.
 * @returns The signup payload.
 */
async function resolveSignupPayload(
  request: NextRequest,
): Promise<Response | SignupPayload> {
  const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
  if (payloadOrResponse instanceof Response) {
    return payloadOrResponse;
  }

  return parseSignupPayload(payloadOrResponse);
}

/**
 * Resolve the signup request error.
 * @param request - The request.
 * @param deps - The deps.
 * @returns The signup request error.
 */
function resolveSignupRequestError(
  request: NextRequest,
  deps: ResolvedSignupRouteDeps,
): null | Response {
  return deps.requireMutableRequestFn(request, {
    rateLimit: {
      key: "signup",
      maxAttempts: CONFIG.RATE_LIMIT_SIGNUP_MAX_ATTEMPTS,
      windowMs: CONFIG.RATE_LIMIT_SIGNUP_WINDOW_MS,
    },
  });
}

/**
 * Resolve the signup route deps.
 * @param deps - The deps.
 * @returns The signup route deps.
 */
function resolveSignupRouteDeps(
  deps: SignupRouteDeps,
): ResolvedSignupRouteDeps {
  return {
    appLogger: deps.logger ?? logger,
    createSessionFn: deps.createSessionFn ?? createSession,
    getDbFn: (deps.getDbFn ?? getDb) as typeof getDb,
    hashPasswordFn: deps.hashPasswordFn ?? hashPassword,
    isUniqueConstraintErrorFn:
      deps.isUniqueConstraintErrorFn ?? isUniqueConstraintError,
    logAndRespondErrorFn:
      deps.logAndRespondErrorFn ?? serverApi.logAndRespondError,
    requireMutableRequestFn:
      deps.requireMutableRequestFn ?? serverApi.requireMutableRequest,
    runtimeFlags: deps.runtimeFlags ?? RUNTIME_FLAGS,
    setSessionCookieFn: deps.setSessionCookieFn ?? setSessionCookie,
  };
}
