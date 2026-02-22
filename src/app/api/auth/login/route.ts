import { requireSameOrigin } from "@/src/lib/auth/csrf";
import {
  createSession,
  setSessionCookie,
  verifyPassword,
} from "@/src/lib/auth/session";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/src/lib/core/runtime";
import { getDb } from "@/src/lib/db/db";
import { users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

function isValidEmail(email: string): boolean {
  return email.includes("@");
}

export async function POST(request: Request) {
  try {
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

    if (!email || !isValidEmail(email)) {
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

    if (RUNTIME_FLAGS.usePlaceholderData) {
      if (!RUNTIME_FLAGS.allowPlaceholderAuth) {
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
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 },
        );
      }

      const token = await createSession(PLACEHOLDER_ADMIN_USER.id);

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

    if (!user) {
      const isPlaceholderEmail = email === PLACEHOLDER_ADMIN_USER.email;
      const isPlaceholderPassword = await verifyPassword(
        password,
        PLACEHOLDER_ADMIN_USER.passwordHash,
      );

      if (isPlaceholderEmail && isPlaceholderPassword) {
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

      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const token = await createSession(user.id);

    const response = NextResponse.json({
      user: { id: user.id, email: user.email },
    });
    setSessionCookie(response, token);

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
