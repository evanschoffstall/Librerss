import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  deleteSessionByToken,
} from "@/lib/auth/session";
import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";

import { requireSameOrigin } from "@/lib/auth/csrf";
export async function POST(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      await deleteSessionByToken(token);
    }

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

    return response;
  } catch (error) {
    logger.error("Logout error", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
