import { getUserFromRequest } from "@/lib/auth/session";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        user: null,
        allowSignup: RUNTIME_FLAGS.allowSignup,
        usePlaceholderData: RUNTIME_FLAGS.usePlaceholderData,
      });
    }

    return NextResponse.json({
      authenticated: true,
      user: { id: user.userId, email: user.email },
      allowSignup: RUNTIME_FLAGS.allowSignup,
      usePlaceholderData: RUNTIME_FLAGS.usePlaceholderData,
    });
  } catch (error) {
    logger.error("Session fetch error", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
