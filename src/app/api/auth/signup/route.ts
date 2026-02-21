import {
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/src/lib/auth/session";
import { RUNTIME_FLAGS } from "@/src/lib/core/runtime";
import { getDb } from "@/src/lib/db/db";
import { users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    if (RUNTIME_FLAGS.usePlaceholderData) {
      return NextResponse.json(
        { error: "Signup is disabled when SUPABASE_URL is not configured" },
        { status: 503 },
      );
    }

    const db = getDb();
    const body = await request.json();
    const email = body?.email?.trim()?.toLowerCase();
    const password = body?.password;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 },
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);

    const [createdUser] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email });

    const token = await createSession(createdUser.id);

    const response = NextResponse.json({ user: createdUser }, { status: 201 });
    setSessionCookie(response, token);

    return response;
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
