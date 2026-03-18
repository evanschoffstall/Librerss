import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { logger } from "@/lib/logger";
import { requireMutableAuthenticatedUser } from "@/lib/server";
import { exportAccountData, ServiceError } from "@/lib/server/services";

export const dynamic = "force-dynamic";

interface AccountExportRouteDeps {
  getDbFn?: () => unknown;
  infoFn?: typeof logger.info;
  requireAuthFn?: (
    request: NextRequest,
  ) => Promise<Response | { userId: number }>;
  runtimeFlags?: Pick<typeof RUNTIME_FLAGS, "usePlaceholderData">;
}

export async function GET(
  request: NextRequest,
  deps: AccountExportRouteDeps = {},
) {
  const requireAuth = deps.requireAuthFn ?? requireMutableAuthenticatedUser;
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  try {
    const payload = await exportAccountData(authResult.userId, {
      getDbFn: deps.getDbFn,
    });

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "cache-control": "no-store",
        "content-disposition":
          'attachment; filename="librerss-account-export.json"',
        "content-type": "application/json; charset=utf-8",
      },
      status: 200,
    });
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
