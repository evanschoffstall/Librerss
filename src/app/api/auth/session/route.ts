import { logAndRespondError } from "@/lib/server";
import { getUserFromRequest } from "@/lib/auth/session";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
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
    return logAndRespondError("Session fetch error", error);
  }
}
