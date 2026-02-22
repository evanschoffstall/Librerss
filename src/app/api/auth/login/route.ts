import { requireSameOrigin } from "@/lib/auth/csrf";
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
import { rateLimiter } from "@/lib/utils/rate-limit";
import { isValidEmail } from "@/lib/utils/validation";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Rate limiting
    const rateLimitError = rateLimiter.check(request, "login", {
      windowMs: CONFIG.RATE_LIMIT_LOGIN_WINDOW_MS,
      maxAttempts: CONFIG.RATE_LIMIT_LOGIN_MAX_ATTEMPTS,
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    // CSRF protection
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

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
      logger.warn("Login attempt with invalid email");
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 },
      );
    }

    if (typeof password !== "string" || password.length === 0) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 },
      );
    }

    // Placeholder mode (dev/demo only)
    if (RUNTIME_FLAGS.usePlaceholderData) {
      if (!RUNTIME_FLAGS.allowPlaceholderAuth) {
        logger.warn("Login attempt when placeholder auth is disabled");
        return NextResponse.json(
          { error: "Authentication is unavailable without a database" },
          { status: 503 },
        );
      }

      const isPlaceholderEmail = email === PLACEHOLDER_ADMIN_USER.email;
      const isValidPassword = await verifyPassword(
        password,
        PLACEHOLDER_ADMIN_USER.passwordHash,
      );

      if (!isPlaceholderEmail || !isValidPassword) {
        logger.warn("Failed placeholder login attempt", { email });
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 },
        );
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

    // SECURITY FIX: Only create placeholder admin in development mode
    if (!user) {
      // In development, allow creating placeholder admin
      if (process.env.NODE_ENV === "development") {
        const isPlaceholderEmail = email === PLACEHOLDER_ADMIN_USER.email;
        const isPlaceholderPassword = await verifyPassword(
          password,
          PLACEHOLDER_ADMIN_USER.passwordHash,
        );

        if (isPlaceholderEmail && isPlaceholderPassword) {
          logger.info(
            "Creating placeholder admin user (development mode only)",
            { email },
          );

          const [createdUser] = await db
            .insert(users)
            .values({
              email: PLACEHOLDER_ADMIN_USER.email,
              passwordHash: PLACEHOLDER_ADMIN_USER.passwordHash,
            })
            .returning({ id: users.id, email: users.email });

          const token = await createSession(createdUser.id);

          const response = NextResponse.json({
            user: { id: createdUser.id, email: createdUser.email },
          });
          setSessionCookie(response, token);

          return response;
        }
      }

      logger.warn("Login attempt with non-existent email", { email });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      logger.warn("Failed login attempt (invalid password)", {
        userId: user.id,
        email: user.email,
      });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
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
    logger.error("Login error", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
