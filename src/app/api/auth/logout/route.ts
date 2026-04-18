import { NextRequest, NextResponse } from "next/server";

import {
  clearSessionCookie,
  deleteSessionByToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { serverApi } from "@/lib/server";

/**
 * @param request
 */
export async function POST(request: NextRequest) {
  try {
    const requestError = serverApi.requireMutableRequest(request);
    if (requestError) {
      return requestError;
    }

    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      await deleteSessionByToken(token);
    }

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

    return response;
  } catch (error) {
    return serverApi.logAndRespondError("Logout error", error);
  }
}
