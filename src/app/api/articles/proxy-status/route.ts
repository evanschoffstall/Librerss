import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib";
import { getProxyStatus } from "@/lib/outbound-proxy";
import { serverApi } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * @param request
 */
export async function GET(request: NextRequest) {
  const authResult = await serverApi.requireAuthenticatedUser(request);
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
    if (error instanceof serverApi.ServerServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({
      configured: false,
      proxyUrl: null,
      status: "unreachable",
    });
  }
}
