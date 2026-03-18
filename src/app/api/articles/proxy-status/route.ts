import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  probeProxy,
  type ProxyStatus,
  requireAuthenticatedUser,
} from "@/lib/server";
import { stripUrlCredentials } from "@/lib/utils/url";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof Response) return authResult;

  const db = getDb();
  const rows = await db
    .select({ proxyUrl: users.proxyUrl })
    .from(users)
    .where(eq(users.id, authResult.userId))
    .limit(1);

  const rawProxyUrl = rows.length === 0 ? null : (rows[0].proxyUrl?.trim() ?? "");
  if (!rawProxyUrl) {
    logger.info("Proxy status check: no proxy configured", {
      userId: authResult.userId,
    });
    return NextResponse.json({
      configured: false,
      proxyUrl: null,
      status: "unreachable" as ProxyStatus,
    });
  }

  logger.info("Proxy status check started", {
    proxyUrl: stripUrlCredentials(rawProxyUrl),
    userId: authResult.userId,
  });
  const reachable = await probeProxy(rawProxyUrl);
  const status: ProxyStatus = reachable ? "reachable" : "unreachable";
  if (!reachable) {
    logger.error("Proxy status check: unreachable", {
      proxyUrl: stripUrlCredentials(rawProxyUrl),
    });
  } else {
    logger.info("Proxy status check: reachable", {
      proxyUrl: stripUrlCredentials(rawProxyUrl),
    });
  }
  return NextResponse.json({
    configured: true,
    proxyUrl: stripUrlCredentials(rawProxyUrl),
    status,
  });
}
