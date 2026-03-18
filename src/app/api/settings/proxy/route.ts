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
  encryptStoredProxyPassword,
  materializeStoredProxyPassword,
  MAX_PROXY_CREDENTIAL_LENGTH,
  MAX_PROXY_URL_LENGTH,
  normalizeProxyUrl,
  probeProxy,
  type ProxyStatus,
  requireMutableAuthenticatedUser,
} from "@/lib/server";
import {
  getUrlCredentials,
  injectProxyCredentials,
  redactUrlForLogs,
} from "@/lib/utils/url";

export const dynamic = "force-dynamic";

export interface ProxyRouteDeps {
  detectFn?: (host: string, port: number) => Promise<"http" | "socks5">;
  dnsCheckFn?: (host: string) => Promise<boolean>;
  probeFn?: (proxyUrl: string) => Promise<boolean>;
  requireAuthFn?: (
    request: NextRequest,
  ) => Promise<AuthenticatedUser | Response>;
}

/**
 * Returns the saved proxy configuration for the authenticated user and probes
 * the current endpoint with any stored credentials applied.
 */
export async function GET(request: NextRequest, deps: ProxyRouteDeps = {}) {
  const result = await resolveAuth(request, deps);
  if (result instanceof Response) return result;

  const db = getDb();
  const rows = await db
    .select({
      allowInsecureTls: users.allowInsecureTls,
      proxyPassword: users.proxyPassword,
      proxyUrl: users.proxyUrl,
      proxyUsername: users.proxyUsername,
    })
    .from(users)
    .where(eq(users.id, result.auth.userId))
    .limit(1);

  if (rows.length === 0) return unconfiguredResponse();
  const user = rows[0];

  const rawProxyUrl = user.proxyUrl?.trim() ?? "";
  if (!rawProxyUrl) return unconfiguredResponse();

  const embeddedCredentials = getUrlCredentials(rawProxyUrl);
  const proxyUrl = embeddedCredentials?.sanitizedUrl ?? rawProxyUrl;
  const proxyUsername =
    user.proxyUsername ?? embeddedCredentials?.username ?? null;

  let decryptedProxyPassword: null | string;
  try {
    decryptedProxyPassword = await materializeStoredProxyPassword(
      user.proxyPassword,
      async (normalizedStoredPassword) => {
        await db
          .update(users)
          .set({ proxyPassword: normalizedStoredPassword })
          .where(eq(users.id, result.auth.userId));
      },
    );
  } catch (error) {
    logger.error("Saved proxy password could not be materialized", {
      error: error instanceof Error ? error.message : String(error),
      userId: result.auth.userId,
    });
    return configuredResponseWithError(
      proxyUrl,
      user.allowInsecureTls,
      proxyUsername,
      user.proxyPassword !== null || embeddedCredentials?.password !== null,
      "Saved proxy password could not be read. Save it again to continue using authenticated proxy access.",
    );
  }

  return probeAndRespond(
    proxyUrl,
    result.probe,
    "Proxy unreachable on GET",
    user.allowInsecureTls,
    proxyUsername,
    decryptedProxyPassword ?? embeddedCredentials?.password ?? null,
  );
}

/**
 * Validates and stores proxy settings for the authenticated user.
 */
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
  const embeddedCredentials = raw ? getUrlCredentials(raw) : null;
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

  const hasEmbeddedProxyCredentials =
    embeddedCredentials !== null &&
    (embeddedCredentials.username !== null ||
      embeddedCredentials.password !== null);

  if (
    hasEmbeddedProxyCredentials &&
    (proxyUsername !== undefined || proxyPassword !== undefined)
  ) {
    return unconfiguredResponse(
      "Provide proxy credentials either in the dedicated username/password fields or in the URL, but not both.",
    );
  }

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
  const effectiveProxyUsername =
    proxyUsername !== undefined
      ? proxyUsername
      : embeddedCredentials?.username ?? undefined;
  const effectiveProxyPassword =
    proxyPassword !== undefined
      ? proxyPassword
      : embeddedCredentials?.password ?? undefined;
  let storedProxyPassword = effectiveProxyPassword;

  if (effectiveProxyPassword !== undefined && effectiveProxyPassword !== null) {
    try {
      storedProxyPassword = encryptStoredProxyPassword(effectiveProxyPassword);
    } catch (error) {
      logger.error("Proxy password encryption failed", {
        error: error instanceof Error ? error.message : String(error),
        userId: result.auth.userId,
      });
      return unconfiguredResponse(
        "Proxy password encryption is not configured correctly on this deployment.",
      );
    }
  }

  const updatedRows = await db
    .update(users)
    .set({
      proxyUrl,
      ...(allowInsecureTls !== undefined && { allowInsecureTls }),
      ...(effectiveProxyUsername !== undefined && {
        proxyUsername: effectiveProxyUsername,
      }),
      ...(storedProxyPassword !== undefined && {
        proxyPassword: storedProxyPassword,
      }),
    })
    .where(eq(users.id, result.auth.userId))
    .returning({
      allowInsecureTls: users.allowInsecureTls,
      proxyPassword: users.proxyPassword,
      proxyUsername: users.proxyUsername,
    });

  const effectiveTls =
    updatedRows.length === 0 ? false : updatedRows[0].allowInsecureTls;
  const effectiveUsername =
    updatedRows.length === 0 ? null : updatedRows[0].proxyUsername;
  let effectivePassword: null | string;

  if (effectiveProxyPassword !== undefined) {
    effectivePassword = effectiveProxyPassword;
  } else {
    try {
      effectivePassword = await materializeStoredProxyPassword(
        updatedRows.length === 0 ? null : updatedRows[0].proxyPassword,
        async (normalizedStoredPassword) => {
          await db
            .update(users)
            .set({ proxyPassword: normalizedStoredPassword })
            .where(eq(users.id, result.auth.userId));
        },
      );
    } catch (error) {
      logger.error("Saved proxy password could not be materialized", {
        error: error instanceof Error ? error.message : String(error),
        userId: result.auth.userId,
      });
      if (!proxyUrl) return unconfiguredResponse();
      return configuredResponseWithError(
        proxyUrl,
        effectiveTls,
        effectiveUsername,
        updatedRows.length > 0 && updatedRows[0].proxyPassword !== null,
        "Saved proxy password could not be read. Save it again to continue using authenticated proxy access.",
      );
    }
  }

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

/**
 * Returns a configured proxy response while surfacing a non-fatal credential
 * read error to the settings client.
 */
function configuredResponseWithError(
  proxyUrl: string,
  allowInsecureTls: boolean,
  proxyUsername: null | string,
  hasProxyPassword: boolean,
  error: string,
): Response {
  return NextResponse.json({
    allowInsecureTls,
    configured: true,
    error,
    hasProxyPassword,
    proxyUrl,
    proxyUsername,
    status: "unreachable" as ProxyStatus,
  });
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
