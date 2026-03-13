import { NextRequest, NextResponse } from "next/server";

import { getUserFromRequest } from "@/lib/auth/session";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { logAndRespondError } from "@/lib/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({
        allowSignup: RUNTIME_FLAGS.allowSignup,
        authenticated: false,
        usePlaceholderData: RUNTIME_FLAGS.usePlaceholderData,
        user: null,
      });
    }

    return NextResponse.json({
      allowSignup: RUNTIME_FLAGS.allowSignup,
      authenticated: true,
      usePlaceholderData: RUNTIME_FLAGS.usePlaceholderData,
      user: { email: user.email, id: user.userId },
    });
  } catch (error) {
    return logAndRespondError("Session fetch error", error);
  }
}
