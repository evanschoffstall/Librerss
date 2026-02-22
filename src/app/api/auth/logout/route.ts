import { logAndRespondError } from "@/lib/api/route-helpers";
import { requireSameOrigin } from "@/lib/auth/csrf";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  deleteSessionByToken,
} from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

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
    return logAndRespondError("Logout error", error);
  }
}
