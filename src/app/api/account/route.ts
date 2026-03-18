import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { clearSessionCookie } from "@/lib/auth/session";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireMutableAuthenticatedUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return jsonError("Account deletion is unavailable in preview mode", 503);
    }

    const db = getDb();
    const deletedUsers = await db
      .delete(users)
      .where(eq(users.id, authResult.userId))
      .returning({ id: users.id });

    if (deletedUsers.length === 0) {
      return jsonError("Account not found", 404);
    }

    logger.warn("User deleted account", {
      userId: authResult.userId,
    });

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

    return response;
  } catch (error) {
    return logAndRespondError("Account deletion error", error);
  }
}
