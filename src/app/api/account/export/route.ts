import { NextRequest, NextResponse } from "next/server";

import type { getDb } from "@/lib/db";

import { logger } from "@/lib";
import { jsonError } from "@/lib/api/http";
import { RUNTIME_FLAGS } from "@/lib/core/placeholder";
import { exportAccountData, serverApi } from "@/lib/server";

export const dynamic = "force-dynamic";

interface AccountExportRouteDeps {
  exportAccountDataFn?: typeof exportAccountData;
  getDbFn?: () => Pick<ReturnType<typeof getDb>, "select">;
  infoFn?: typeof logger.info;
  requireAuthFn?: (
    request: NextRequest,
  ) => Promise<Response | { userId: number }>;
  runtimeFlags?: Pick<typeof RUNTIME_FLAGS, "usePlaceholderData">;
  serverServiceErrorClass?: typeof serverApi.ServerServiceError;
}

/**
 * Render the get component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered get component.
 */
export async function GET(
  request: NextRequest,
  depsOrContext: AccountExportRouteDeps | serverApi.RouteHandlerContext = {},
) {
  const deps = resolveAccountExportRouteDeps(depsOrContext);
  const exportAccountDataForRoute =
    deps.exportAccountDataFn ?? exportAccountData;
  const ServerServiceErrorForRoute =
    deps.serverServiceErrorClass ?? serverApi.ServerServiceError;
  const requireAuth =
    deps.requireAuthFn ?? serverApi.requireMutableAuthenticatedUser;
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
 * Resolve the account export route deps.
 * @param depsOrContext - The deps or context.
 * @returns The account export route deps.
 */
export function resolveAccountExportRouteDeps(
  depsOrContext:
    | AccountExportRouteDeps
    | serverApi.RouteHandlerContext
    | undefined,
): AccountExportRouteDeps {
  if (
    depsOrContext === undefined ||
    (typeof depsOrContext === "object" && "params" in depsOrContext)
  ) {
    return {};
  }

  return depsOrContext;
}
