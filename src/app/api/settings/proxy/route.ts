import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { parseJsonBodyOrResponse } from "@/lib/api/http";
import { resolvesToBlockedAddress } from "@/lib/core/dns-cache";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  type AuthenticatedUser,
  detectProxyProtocol,
  MAX_PROXY_CREDENTIAL_LENGTH,
  MAX_PROXY_URL_LENGTH,
  normalizeProxyUrl,
  probeProxy,
  type ProxyStatus,
  requireMutableAuthenticatedUser,
} from "@/lib/server";
import { injectProxyCredentials, redactUrlForLogs } from "@/lib/utils/url";

export { type ProxySettingsResponse, type ProxyStatus } from "@/lib/server";

export const dynamic = "force-dynamic";

export interface ProxyRouteDeps {
  detectFn?: (host: string, port: number) => Promise<"http" | "socks5">;
  dnsCheckFn?: (host: string) => Promise<boolean>;
  probeFn?: (proxyUrl: string) => Promise<boolean>;
  requireAuthFn?: (
    request: NextRequest,
  ) => Promise<AuthenticatedUser | Response>;
}

export async function GET(request: NextRequest, deps: ProxyRouteDeps = {}) {
  const result = await resolveAuth(request, deps);
  if (result instanceof Response) return result;

  const db = getDb();
  const [user] = await db
    .select({
      allowInsecureTls: users.allowInsecureTls,
      proxyPassword: users.proxyPassword,
      proxyUrl: users.proxyUrl,
      proxyUsername: users.proxyUsername,
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
    user?.proxyUsername ?? null,
    user?.proxyPassword ?? null,
  );
}

export async function PUT(request: NextRequest, deps: ProxyRouteDeps = {}) {
  const result = await resolveAuth(request, deps);
  if (result instanceof Response) return result;

  const body = await parseJsonBodyOrResponse<{
    allowInsecureTls?: boolean;
    proxyPassword?: null | string;
    proxyUrl?: null | string;
    proxyUsername?: null | string;
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
  const proxyUsername =
    typeof body.proxyUsername === "string" && body.proxyUsername.trim()
      ? body.proxyUsername.trim()
      : body.proxyUsername === null || body.proxyUsername === ""
        ? null
        : undefined;
  const proxyPassword =
    typeof body.proxyPassword === "string" && body.proxyPassword
      ? body.proxyPassword
      : body.proxyPassword === null || body.proxyPassword === ""
        ? null
        : undefined;

  if (raw && raw.length > MAX_PROXY_URL_LENGTH) {
    logger.error("Proxy URL exceeds max length", {
      length: raw.length,
      max: MAX_PROXY_URL_LENGTH,
    });
    return unconfiguredResponse("Proxy URL too long");
  }

  if (
    typeof body.proxyUsername === "string" &&
    body.proxyUsername.length > MAX_PROXY_CREDENTIAL_LENGTH
  ) {
    return unconfiguredResponse("Proxy username too long");
  }

  if (
    typeof body.proxyPassword === "string" &&
    body.proxyPassword.length > MAX_PROXY_CREDENTIAL_LENGTH
  ) {
    return unconfiguredResponse("Proxy password too long");
  }

  let proxyUrl: null | string = null;
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
      ...(proxyUsername !== undefined && { proxyUsername }),
      ...(proxyPassword !== undefined && { proxyPassword }),
    })
    .where(eq(users.id, result.auth.userId))
    .returning({
      allowInsecureTls: users.allowInsecureTls,
      proxyPassword: users.proxyPassword,
      proxyUsername: users.proxyUsername,
    });

  const effectiveTls = updated?.allowInsecureTls ?? false;
  const effectiveUsername = updated?.proxyUsername ?? null;
  const effectivePassword = updated?.proxyPassword ?? null;

  if (!proxyUrl) return unconfiguredResponse();
  return probeAndRespond(
    proxyUrl,
    result.probe,
    "Proxy saved but unreachable",
    effectiveTls,
    effectiveUsername,
    effectivePassword,
  );
}

async function probeAndRespond(
  proxyUrl: string,
  probe: (url: string) => Promise<boolean>,
  logLabel: string,
  allowInsecureTls = false,
  proxyUsername: null | string = null,
  proxyPassword: null | string = null,
): Promise<Response> {
  // Inject credentials into the probe URL so SOCKS5 auth is actually tested.
  const probeUrl =
    proxyUsername && proxyPassword
      ? injectProxyCredentials(proxyUrl, proxyUsername, proxyPassword)
      : proxyUrl;
  const reachable = await probe(probeUrl);
  if (!reachable)
    logger.error(logLabel, { proxyUrl: redactUrlForLogs(proxyUrl) });
  return NextResponse.json({
    allowInsecureTls,
    configured: true,
    hasProxyPassword: proxyPassword !== null,
    proxyUrl,
    proxyUsername,
    status: (reachable ? "reachable" : "unreachable") as ProxyStatus,
  });
}

async function resolveAuth(
  request: NextRequest,
  deps: ProxyRouteDeps,
): Promise<
  | Response
  | {
      auth: AuthenticatedUser;
      detect: (host: string, port: number) => Promise<"http" | "socks5">;
      dnsCheck: (host: string) => Promise<boolean>;
      probe: (url: string) => Promise<boolean>;
    }
> {
  const requireAuth = deps.requireAuthFn ?? requireMutableAuthenticatedUser;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  return {
    auth,
    detect: deps.detectFn ?? detectProxyProtocol,
    dnsCheck: deps.dnsCheckFn ?? resolvesToBlockedAddress,
    probe: deps.probeFn ?? probeProxy,
  };
}

function unconfiguredResponse(error?: string): Response {
  return NextResponse.json({
    allowInsecureTls: false,
    configured: false,
    hasProxyPassword: false,
    proxyUrl: null,
    proxyUsername: null,
    status: "unreachable" as ProxyStatus,
    ...(error && { error }),
  });
}
