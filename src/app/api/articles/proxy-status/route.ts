import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { logger } from "@/lib/logger";
import { getProxyStatus, requireAuthenticatedUser, ServiceError } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof Response) return authResult;

  logger.info("Proxy status check started", { userId: authResult.userId });

  try {
    const result = await getProxyStatus(authResult.userId);
    if (result.configured && result.status === "reachable") {
      logger.info("Proxy status check: reachable", {
        proxyUrl: result.proxyUrl,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return NextResponse.json(
      { configured: false, proxyUrl: null, status: "unreachable" },
    );
  }
}
