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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof Response) return authResult;

  const db = getDb();
  const [user] = await db
    .select({ proxyUrl: users.proxyUrl })
    .from(users)
    .where(eq(users.id, authResult.userId))
    .limit(1);

  const proxyUrl = user?.proxyUrl?.trim() || null;
  if (!proxyUrl) {
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
    proxyUrl,
    userId: authResult.userId,
  });
  const reachable = await probeProxy(proxyUrl);
  const status: ProxyStatus = reachable ? "reachable" : "unreachable";
  if (!reachable) {
    logger.error("Proxy status check: unreachable", { proxyUrl });
  } else {
    logger.info("Proxy status check: reachable", { proxyUrl });
  }
  return NextResponse.json({
    configured: true,
    proxyUrl,
    status,
  });
}
