import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { logger } from "@/lib/logger";
import {
  exportAccountData,
  requireMutableAuthenticatedUser,
  type RouteHandlerContext,
  ServerServiceError,
} from "@/lib/server";

export const dynamic = "force-dynamic";

interface AccountExportRouteDeps {
  exportAccountDataFn?: typeof exportAccountData;
  getDbFn?: () => unknown;
  infoFn?: typeof logger.info;
  requireAuthFn?: (
    request: NextRequest,
  ) => Promise<Response | { userId: number }>;
  runtimeFlags?: Pick<typeof RUNTIME_FLAGS, "usePlaceholderData">;
  serverServiceErrorClass?: typeof ServerServiceError;
}

export async function GET(
  request: NextRequest,
  depsOrContext: AccountExportRouteDeps | RouteHandlerContext = {},
) {
  const deps = resolveAccountExportRouteDeps(depsOrContext);
  const exportAccountDataForRoute =
    deps.exportAccountDataFn ?? exportAccountData;
  const ServerServiceErrorForRoute =
    deps.serverServiceErrorClass ?? ServerServiceError;
  const requireAuth = deps.requireAuthFn ?? requireMutableAuthenticatedUser;
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  try {
    const payload = await exportAccountDataForRoute(authResult.userId, {
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
    if (error instanceof ServerServiceErrorForRoute) {
      return jsonError(error.message, error.status);
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * Distinguishes test dependency bags from the framework's route context.
 *
 * Keeping this resolver local lets the route tests inject a stable export
 * function without depending on the globally mocked server barrel.
 */
export function resolveAccountExportRouteDeps(
  depsOrContext: AccountExportRouteDeps | RouteHandlerContext | undefined,
): AccountExportRouteDeps {
  if (
    depsOrContext === undefined ||
    (typeof depsOrContext === "object" && "params" in depsOrContext)
  ) {
    return {};
  }

  return depsOrContext;
}
