import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { clearSessionCookie } from "@/lib/auth";
import { deleteAccount, serverApi } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await serverApi.requireMutableAuthenticatedUser(request);
    if (authResult instanceof Response) return authResult;

    await deleteAccount(authResult.userId);

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError)
      return jsonError(error.message, error.status);
    return serverApi.logAndRespondError("Account deletion error", error);
  }
}
