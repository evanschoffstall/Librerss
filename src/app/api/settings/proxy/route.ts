import { parseJsonBodyOrResponse } from "@/lib/api/http";
import { resolvesToBlockedAddress } from "@/lib/core/dns-cache";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  detectProxyProtocol,
  MAX_PROXY_URL_LENGTH,
  normalizeProxyUrl,
  probeProxy,
  requireMutableAuthenticatedUser,
  type AuthenticatedUser,
  type ProxyStatus,
} from "@/lib/server";
import { redactUrlForLogs } from "@/lib/utils/url";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export { type ProxySettingsResponse, type ProxyStatus } from "@/lib/server";

export const dynamic = "force-dynamic";

export type ProxyRouteDeps = {
  requireAuthFn?: (
    request: NextRequest,
  ) => Promise<AuthenticatedUser | Response>;
  probeFn?: (proxyUrl: string) => Promise<boolean>;
  detectFn?: (host: string, port: number) => Promise<"socks5" | "http">;
  dnsCheckFn?: (host: string) => Promise<boolean>;
};

function unconfiguredResponse(error?: string): Response {
  return NextResponse.json({
    proxyUrl: null,
    configured: false,
    status: "unreachable" as ProxyStatus,
    allowInsecureTls: false,
    ...(error && { error }),
  });
}

async function probeAndRespond(
  proxyUrl: string,
  probe: (url: string) => Promise<boolean>,
  logLabel: string,
  allowInsecureTls = false,
): Promise<Response> {
  const reachable = await probe(proxyUrl);
  if (!reachable)
    logger.error(logLabel, { proxyUrl: redactUrlForLogs(proxyUrl) });
  return NextResponse.json({
    proxyUrl,
    configured: true,
    status: (reachable ? "reachable" : "unreachable") as ProxyStatus,
    allowInsecureTls,
  });
}

async function resolveAuth(
  request: NextRequest,
  deps: ProxyRouteDeps,
): Promise<
  | {
      auth: AuthenticatedUser;
      probe: (url: string) => Promise<boolean>;
      detect: (host: string, port: number) => Promise<"socks5" | "http">;
      dnsCheck: (host: string) => Promise<boolean>;
    }
  | Response
> {
  const requireAuth = deps.requireAuthFn ?? requireMutableAuthenticatedUser;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  return {
    auth,
    probe: deps.probeFn ?? probeProxy,
    detect: deps.detectFn ?? detectProxyProtocol,
    dnsCheck: deps.dnsCheckFn ?? resolvesToBlockedAddress,
  };
}

export async function GET(request: NextRequest, deps: ProxyRouteDeps = {}) {
  const result = await resolveAuth(request, deps);
  if (result instanceof Response) return result;

  const db = getDb();
  const [user] = await db
    .select({
      proxyUrl: users.proxyUrl,
      allowInsecureTls: users.allowInsecureTls,
    })
    .from(users)
    .where(eq(users.id, result.auth.userId))
    .limit(1);

  const proxyUrl = user?.proxyUrl?.trim() || null;
  if (!proxyUrl) return unconfiguredResponse();
  return probeAndRespond(
    proxyUrl,
    result.probe,
    "Proxy unreachable on GET",
    user?.allowInsecureTls ?? false,
  );
}

export async function PUT(request: NextRequest, deps: ProxyRouteDeps = {}) {
  const result = await resolveAuth(request, deps);
  if (result instanceof Response) return result;

  const body = await parseJsonBodyOrResponse<{
    proxyUrl?: string | null;
    allowInsecureTls?: boolean;
  }>(request);
  if (body instanceof Response) return body;

  const trimmed =
    typeof body.proxyUrl === "string" ? body.proxyUrl.trim() : null;
  const raw =
    trimmed && trimmed !== "null" && trimmed !== "undefined" ? trimmed : null;
  const allowInsecureTls =
    typeof body.allowInsecureTls === "boolean"
      ? body.allowInsecureTls
      : undefined;

  if (raw && raw.length > MAX_PROXY_URL_LENGTH) {
    logger.error("Proxy URL exceeds max length", {
      length: raw.length,
      max: MAX_PROXY_URL_LENGTH,
    });
    return unconfiguredResponse("Proxy URL too long");
  }

  let proxyUrl: string | null = null;
  if (raw) {
    const normalized = await normalizeProxyUrl(
      raw,
      result.detect,
      result.dnsCheck,
    );
    if (!normalized) {
      logger.error("Invalid proxy URL submitted", {
        raw: redactUrlForLogs(raw),
      });
      return unconfiguredResponse(
        "Invalid proxy URL. Accepted formats: http://host:port, socks5://host:port, or bare host:port",
      );
    }
    proxyUrl = normalized;
  }

  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      proxyUrl,
      ...(allowInsecureTls !== undefined && { allowInsecureTls }),
    })
    .where(eq(users.id, result.auth.userId))
    .returning({ allowInsecureTls: users.allowInsecureTls });

  const effectiveTls = updated?.allowInsecureTls ?? false;

  if (!proxyUrl) return unconfiguredResponse();
  return probeAndRespond(
    proxyUrl,
    result.probe,
    "Proxy saved but unreachable",
    effectiveTls,
  );
}
