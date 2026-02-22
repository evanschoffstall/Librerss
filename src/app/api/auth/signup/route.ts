import { requireSameOrigin } from "@/lib/auth/csrf";
import {
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import { rateLimiter } from "@/lib/utils/rate-limit";
import { isStrongPassword, isValidEmail } from "@/lib/utils/validation";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Rate limiting
    const rateLimitError = rateLimiter.check(request, "signup", {
      windowMs: CONFIG.RATE_LIMIT_SIGNUP_WINDOW_MS,
      maxAttempts: CONFIG.RATE_LIMIT_SIGNUP_MAX_ATTEMPTS,
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    // CSRF protection
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    if (!RUNTIME_FLAGS.allowSignup) {
      logger.warn("Signup attempt when signup is disabled");
      return NextResponse.json(
        { error: "Signup is disabled by server configuration" },
        { status: 403 },
      );
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      logger.warn("Signup attempt when using placeholder data");
      return NextResponse.json(
        { error: "Signup is disabled when DATABASE_URL is not configured" },
        { status: 503 },
      );
    }

    const db = getDb();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";
    const password = payload.password;

    // Email validation
    if (!email || !isValidEmail(email)) {
      logger.warn("Signup attempt with invalid email", {
        email: email ? "provided" : "missing",
      });
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 },
      );
    }

    // Password validation
    if (typeof password !== "string" || !isStrongPassword(password)) {
      logger.warn("Signup attempt with weak password", { email });
      return NextResponse.json(
        {
          error: `Password must be at least ${CONFIG.PASSWORD_MIN_LENGTH} characters and include uppercase, lowercase, and numbers or symbols`,
        },
        { status: 400 },
      );
    }

    // Check for existing user
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      logger.warn("Signup attempt with existing email", { email });
      // Don't reveal that email exists (prevents enumeration)
      return NextResponse.json(
        {
          error:
            "Unable to create account. Please try a different email or contact support.",
        },
        { status: 400 },
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
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 },
      );
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
    logger.error("Signup error", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
