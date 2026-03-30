import { eq } from "drizzle-orm";
/**
 * Server-side proxy operations shared across API surfaces.
 *
 * The {@link resolveUserProxy} function is the canonical way to obtain a
 * ready-to-use proxy URL with credentials for a given user. It is used by the
 * article extraction pipeline, compatibility checks, and proxy status routes.
 */
import net from "node:net";

import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { fetchHtmlWithHttpCloak } from "@/lib/fetch";
import { logger } from "@/lib/logger";
import {
  ensureProxyUrlHasExplicitPort,
  getUrlCredentials,
  injectProxyCredentials,
  stripUrlCredentials,
} from "@/lib/utils/url";

import { probeProxy } from "../proxy";
import { materializeStoredProxyPassword } from "../proxy-credentials";
import { ServerServiceError } from "./errors";

const PUBLIC_IP_PROVIDERS = [
  {
    responseFormat: "text",
    url: "https://checkip.amazonaws.com/",
  },
  {
    responseFormat: "text",
    url: "https://icanhazip.com/",
  },
  {
    responseFormat: "json",
    url: "https://api.ipify.org?format=json",
  },
  {
    responseFormat: "json",
    url: "https://api64.ipify.org?format=json",
  },
] as const;

export interface ProxyRoutingCheckResult {
  directIp: null | string;
  error: null | string;
  proxyExitIp: null | string;
  status: "error" | "proxy-only" | "same-egress" | "verified";
}

export interface ProxyStatusResult {
  configured: boolean;
  proxyUrl: null | string;
  status: "reachable" | "unreachable";
}

export interface ResolvedUserProxy {
  allowInsecureTls: boolean;
  proxyUrl: string | undefined;
}

interface ProxyRoutingCheckDeps {
  fetchHtmlWithHttpCloakFn?: typeof fetchHtmlWithHttpCloak;
}

type PublicIpProvider = (typeof PUBLIC_IP_PROVIDERS)[number];

/**
 * Compares the direct and proxied public egress IPs using the same HTTPCloak
 * request path used by upstream fetches.
 */
export async function getProxyRoutingCheck(
  options: {
    allowInsecureTls: boolean;
    proxyUrl: string;
  },
  deps?: ProxyRoutingCheckDeps,
): Promise<ProxyRoutingCheckResult> {
  const fetchPublicIp = deps?.fetchHtmlWithHttpCloakFn ?? fetchHtmlWithHttpCloak;

  const [directResult, proxiedResult] = await Promise.allSettled([
    readPublicIp(undefined, false, fetchPublicIp),
    readPublicIp(
      options.proxyUrl,
      options.allowInsecureTls,
      fetchPublicIp,
    ),
  ]);

  const directIp = directResult.status === "fulfilled" ? directResult.value : null;
  const proxyExitIp =
    proxiedResult.status === "fulfilled" ? proxiedResult.value : null;

  if (proxyExitIp === null) {
    return {
      directIp,
      error: toSettledReason(proxiedResult),
      proxyExitIp: null,
      status: "error",
    };
  }

  if (directIp === null) {
    return {
      directIp: null,
      error: toSettledReason(directResult),
      proxyExitIp,
      status: "proxy-only",
    };
  }

  return {
    directIp,
    error: null,
    proxyExitIp,
    status: directIp === proxyExitIp ? "same-egress" : "verified",
  };
}

/**
 * Returns a simple reachability check for the user's configured proxy.
 */
export async function getProxyStatus(
  userId: number,
): Promise<ProxyStatusResult> {
  const db = getDb();
  const rows = await db
    .select({ proxyUrl: users.proxyUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const rawProxyUrl =
    rows.length === 0 ? null : (rows[0].proxyUrl?.trim() ?? "");
  if (!rawProxyUrl) {
    return { configured: false, proxyUrl: null, status: "unreachable" };
  }

  const canonicalProxyUrl = ensureProxyUrlHasExplicitPort(rawProxyUrl);

  const reachable = await probeProxy(canonicalProxyUrl);
  const status = reachable ? "reachable" : "unreachable";
  if (!reachable) {
    logger.error("Proxy status check: unreachable", {
      proxyUrl: stripUrlCredentials(canonicalProxyUrl),
    });
  }
  return {
    configured: true,
    proxyUrl: stripUrlCredentials(canonicalProxyUrl),
    status,
  };
}

/**
 * Resolves the fully-qualified proxy URL (with injected credentials) for a
 * user. Returns `undefined` proxy URL when the user has no proxy configured.
 *
 * Throws {@link ServerServiceError} when stored credentials cannot be materialized.
 */
export async function resolveUserProxy(
  userId: number,
): Promise<ResolvedUserProxy> {
  const db = getDb();
  const proxyFields = {
    allowInsecureTls: users.allowInsecureTls,
    proxyPassword: users.proxyPassword,
    proxyUrl: users.proxyUrl,
    proxyUsername: users.proxyUsername,
  } as const;
  const rows = await db
    .select(proxyFields)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0) return { allowInsecureTls: false, proxyUrl: undefined };
  const row = rows[0];

  const rawProxyUrl = row.proxyUrl?.trim();
  const canonicalProxyUrl = rawProxyUrl
    ? ensureProxyUrlHasExplicitPort(rawProxyUrl)
    : rawProxyUrl;
  const embeddedCredentials = canonicalProxyUrl
    ? getUrlCredentials(canonicalProxyUrl)
    : null;
  const baseProxyUrl =
    canonicalProxyUrl !== undefined &&
    canonicalProxyUrl !== "" &&
    canonicalProxyUrl !== "null" &&
    canonicalProxyUrl !== "undefined"
      ? (embeddedCredentials?.sanitizedUrl ?? canonicalProxyUrl)
      : undefined;

  let decryptedProxyPassword: null | string;
  try {
    decryptedProxyPassword = await materializeStoredProxyPassword(
      row.proxyPassword,
      async (normalizedStoredPassword) => {
        await db
          .update(users)
          .set({ proxyPassword: normalizedStoredPassword })
          .where(eq(users.id, userId));
      },
    );
  } catch (error) {
    logger.error("Saved proxy password could not be materialized", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    throw new ServerServiceError(
      "Saved proxy password could not be read. Update it in settings and try again.",
      500,
      "proxy-password-unreadable",
    );
  }

  const proxyUrl =
    baseProxyUrl !== undefined &&
    (row.proxyUsername ?? embeddedCredentials?.username) !== null &&
    (decryptedProxyPassword ?? embeddedCredentials?.password) !== null
      ? injectProxyCredentials(
          baseProxyUrl,
          row.proxyUsername ?? embeddedCredentials?.username ?? "",
          decryptedProxyPassword ?? embeddedCredentials?.password ?? "",
        )
      : baseProxyUrl;

  return { allowInsecureTls: row.allowInsecureTls, proxyUrl };
}

function parsePlainTextPublicIpPayload(body: string): { ip: string } {
  const trimmedBody = body.trim();

  if (trimmedBody === "") {
    throw new Error("Exit IP check returned an empty response body.");
  }

  return { ip: trimmedBody };
}

function parseProviderPublicIpPayload(
  provider: PublicIpProvider,
  body: string,
): { ip: string } {
  return provider.responseFormat === "json"
    ? parsePublicIpPayload(body)
    : parsePlainTextPublicIpPayload(body);
}

/**
 * Parses and validates the fixed JSON payload returned by the public IP echo.
 */
function parsePublicIpPayload(body: string): { ip: string } {
  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(body);
  } catch {
    throw new Error("Exit IP check returned malformed JSON.");
  }

  if (
    typeof parsedBody !== "object" ||
    parsedBody === null ||
    !("ip" in parsedBody) ||
    typeof parsedBody.ip !== "string" ||
    parsedBody.ip.trim() === ""
  ) {
    throw new Error("Exit IP check returned an invalid JSON payload.");
  }

  return { ip: parsedBody.ip.trim() };
}

/**
 * Fetches a public IP echo payload through HTTPCloak and validates the result.
 */
async function readPublicIp(
  proxyUrl: string | undefined,
  allowInsecureTls: boolean,
  fetchPublicIp: typeof fetchHtmlWithHttpCloak,
): Promise<string> {
  let lastError: Error | null = null;

  for (const provider of PUBLIC_IP_PROVIDERS) {
    try {
      const { html } = await fetchPublicIp(
        provider.url,
        (candidateUrl) => Promise.resolve(validatePublicIpEndpoint(candidateUrl)),
        {
          allowInsecureTls,
          ...(proxyUrl ? { proxyUrl } : {}),
        },
      );

      const payload = parseProviderPublicIpPayload(provider, html);
      if (net.isIP(payload.ip) === 0) {
        throw new Error("Exit IP check returned an invalid IP address.");
      }

      return payload.ip;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Exit IP check failed.");
    }
  }

  throw lastError ?? new Error("Exit IP check failed.");
}

function toSettledReason(
  result: PromiseSettledResult<string>,
): string {
  if (result.status === "fulfilled") {
    return "Exit IP check completed without an error.";
  }

  return result.reason instanceof Error
    ? result.reason.message
    : "Exit IP check failed.";
}

/**
 * Restricts the egress proof request to the fixed public IP echo endpoint.
 */
function validatePublicIpEndpoint(candidateUrl: string): boolean {
  const parsedUrl = new URL(candidateUrl);

  return PUBLIC_IP_PROVIDERS.some((provider) => {
    const providerUrl = new URL(provider.url);

    return (
      parsedUrl.protocol === "https:" &&
      parsedUrl.origin === providerUrl.origin &&
      parsedUrl.pathname === providerUrl.pathname &&
      parsedUrl.search === providerUrl.search
    );
  });
}
