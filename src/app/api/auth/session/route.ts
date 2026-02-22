import { getUserFromRequest } from "@/src/lib/auth/session";
import { RUNTIME_FLAGS } from "@/src/lib/core/runtime";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        user: null,
        allowSignup: RUNTIME_FLAGS.allowSignup,
      });
    }

    return NextResponse.json({
      authenticated: true,
      user: { id: user.userId, email: user.email },
      allowSignup: RUNTIME_FLAGS.allowSignup,
    });
  } catch (error) {
    console.error("Session fetch error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
