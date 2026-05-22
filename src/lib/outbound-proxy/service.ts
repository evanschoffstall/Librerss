import { eq } from "drizzle-orm";
import net from "node:net";

import { ServerServiceError } from "@/lib";
import { getDb, users } from "@/lib/db";
import { fetchHtmlWithHttpCloak } from "@/lib/fetch";
/**
 * Server-side proxy operations shared across API surfaces.
 *
 * The {@link resolveUserProxy} function is the canonical way to obtain a
 * ready-to-use proxy URL with credentials for a given user. It is used by the
 * article extraction pipeline, compatibility checks, and proxy status routes.
 */
import { logger } from "@/lib/logger";
import {
  ensureProxyUrlHasExplicitPort,
  getUrlCredentials,
  injectProxyCredentials,
  stripUrlCredentials,
} from "@/lib/utils";

import { materializeStoredProxyPassword } from "./credentials";
import { probeProxy } from "./transport";

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

/**
 * Describes the proxy routing check result.
 */
export interface ProxyRoutingCheckResult {
  directIp: null | string;
  error: null | string;
  proxyExitIp: null | string;
  status: "error" | "proxy-only" | "same-egress" | "verified";
}

/**
 * Describes the proxy status result.
 */
export interface ProxyStatusResult {
  configured: boolean;
  proxyUrl: null | string;
  status: "reachable" | "unreachable";
}

/**
 * Describes the resolved user proxy.
 */
export interface ResolvedUserProxy {
  proxyUrl: string | undefined;
}

/**
 * Describes the proxy routing check deps.
 */
interface ProxyRoutingCheckDeps {
  fetchHtmlWithHttpCloakFn?: typeof fetchHtmlWithHttpCloak;
}

/**
 * Describes the options for proxy routing check.
 */
interface ProxyRoutingCheckOptions {
  proxyUrl: string;
}

/**
 * Defines the public ip provider type.
 */
type PublicIpProvider = (typeof PUBLIC_IP_PROVIDERS)[number];
/**
 * Describes the options for resolved proxy URL.
 */
interface ResolvedProxyUrlOptions {
  baseProxyUrl: string | undefined;
  decryptedProxyPassword: null | string;
  embeddedCredentials: ReturnType<typeof resolveEmbeddedCredentials>;
  proxyUsername: null | string;
}

/**
 * Describes the stored user proxy row.
 */
interface StoredUserProxyRow {
  proxyPassword: null | string;
  proxyUrl: null | string;
  proxyUsername: null | string;
}

/**
 * Run a connectivity check against the configured proxy URL.
 * @param options - The options used to the routing check result including reachability and IP information.
 * @param deps - The deps.
 * @returns The routing check result with direct and proxied exit IPs and a status classification.
 */
export async function getProxyRoutingCheck(
  options: ProxyRoutingCheckOptions,
  deps?: ProxyRoutingCheckDeps,
): Promise<ProxyRoutingCheckResult> {
  const fetchPublicIp =
    deps?.fetchHtmlWithHttpCloakFn ?? fetchHtmlWithHttpCloak;

  const [directResult, proxiedResult] = await Promise.allSettled([
    readPublicIp(undefined, fetchPublicIp),
    readPublicIp(options.proxyUrl, fetchPublicIp),
  ]);

  const directIp =
    directResult.status === "fulfilled" ? directResult.value : null;
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
 * Retrieve the current proxy status and public IP for a user.
 * @param userId - The user ID.
 * @returns The proxy status record including IP and configuration details.
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
 * Resolve the user proxy.
 * @param userId - The user ID.
 * @returns The resolved user proxy including a credential-injected proxy URL, or undefined when no proxy is configured.
 */
export async function resolveUserProxy(
  userId: number,
): Promise<ResolvedUserProxy> {
  const row = await loadStoredUserProxyRow(userId);

  if (!row) {
    return { proxyUrl: undefined };
  }

  const canonicalProxyUrl = normalizeStoredProxyUrl(row.proxyUrl);
  const embeddedCredentials = resolveEmbeddedCredentials(canonicalProxyUrl);
  const baseProxyUrl = embeddedCredentials?.sanitizedUrl ?? canonicalProxyUrl;
  const decryptedProxyPassword = await materializeProxyPassword(row, userId);
  const proxyUrl = buildResolvedProxyUrl({
    baseProxyUrl,
    decryptedProxyPassword,
    embeddedCredentials,
    proxyUsername: row.proxyUsername,
  });

  return { proxyUrl };
}

/**
 * Build the resolved proxy url.
 * @param options - The options used to build the resolved proxy url.
 * @returns The fully-qualified proxy URL with credentials injected, or undefined when no base URL is set.
 */
function buildResolvedProxyUrl(
  options: ResolvedProxyUrlOptions,
): string | undefined {
  const {
    baseProxyUrl,
    decryptedProxyPassword,
    embeddedCredentials,
    proxyUsername,
  } = options;

  if (baseProxyUrl === undefined) {
    return undefined;
  }

  const resolvedUsername = proxyUsername ?? embeddedCredentials?.username;
  const resolvedPassword =
    decryptedProxyPassword ?? embeddedCredentials?.password;

  if (
    resolvedUsername === null ||
    resolvedUsername === undefined ||
    resolvedPassword === null ||
    resolvedPassword === undefined
  ) {
    return baseProxyUrl;
  }

  return injectProxyCredentials(
    baseProxyUrl,
    resolvedUsername,
    resolvedPassword,
  );
}

/**
 * Load the stored proxy configuration row for a user from the database.
 * @param userId - The user ID.
 * @returns The stored proxy row, or null if no proxy is configured.
 */
async function loadStoredUserProxyRow(
  userId: number,
): Promise<StoredUserProxyRow | undefined> {
  const db = getDb();
  const proxyFields = {
    proxyPassword: users.proxyPassword,
    proxyUrl: users.proxyUrl,
    proxyUsername: users.proxyUsername,
  } as const;
  const rows = await db
    .select(proxyFields)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0];
}

/**
 * Materialize the proxy password by normalizing and optionally persisting it.
 * @param row - The row.
 * @param userId - The user ID.
 * @returns The materialized proxy password string, or null if none is set.
 */
async function materializeProxyPassword(
  row: StoredUserProxyRow,
  userId: number,
): Promise<null | string> {
  const db = getDb();

  try {
    return await materializeStoredProxyPassword(
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
}

/**
 * Normalize the stored proxy url.
 * @param proxyUrl - The proxy url.
 * @returns The canonical proxy URL with an explicit port, or undefined when no usable URL is stored.
 */
function normalizeStoredProxyUrl(proxyUrl: null | string): string | undefined {
  const trimmedProxyUrl = proxyUrl?.trim();
  const canonicalProxyUrl = trimmedProxyUrl
    ? ensureProxyUrlHasExplicitPort(trimmedProxyUrl)
    : trimmedProxyUrl;

  if (
    canonicalProxyUrl === undefined ||
    canonicalProxyUrl === "" ||
    canonicalProxyUrl === "null" ||
    canonicalProxyUrl === "undefined"
  ) {
    return undefined;
  }

  return canonicalProxyUrl;
}

/**
 * Parse the plain text public ip payload.
 * @param body - The body.
 * @returns An object with the trimmed IP string extracted from a plain-text response body.
 */
function parsePlainTextPublicIpPayload(body: string): { ip: string } {
  const trimmedBody = body.trim();

  if (trimmedBody === "") {
    throw new Error("Exit IP check returned an empty response body.");
  }

  return { ip: trimmedBody };
}

/**
 * Parse the provider public ip payload.
 * @param provider - The provider.
 * @param body - The body.
 * @returns An object with the IP string parsed from the provider response body.
 */
function parseProviderPublicIpPayload(
  provider: PublicIpProvider,
  body: string,
): { ip: string } {
  return provider.responseFormat === "json"
    ? parsePublicIpPayload(body)
    : parsePlainTextPublicIpPayload(body);
}

/**
 * Parse the public ip payload.
 * @param body - The body.
 * @returns An object with the IP string parsed from the JSON response body.
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
 * Read the current public IP address by querying configured provider endpoints.
 * @param proxyUrl - The proxy url.
 * @param fetchPublicIp - The fetch public ip.
 * @returns The detected public IP address string from the first successful provider.
 */
async function readPublicIp(
  proxyUrl: string | undefined,
  fetchPublicIp: typeof fetchHtmlWithHttpCloak,
): Promise<string> {
  let lastError: Error | null = null;

  for (const provider of PUBLIC_IP_PROVIDERS) {
    try {
      const { html } = await fetchPublicIp(
        provider.url,
        (candidateUrl) =>
          Promise.resolve(validatePublicIpEndpoint(candidateUrl)),
        {
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
        error instanceof Error ? error : new Error("Exit IP check failed.");
    }
  }

  throw lastError ?? new Error("Exit IP check failed.");
}

/**
 * Resolve the embedded credentials.
 * @param proxyUrl - The proxy url.
 * @returns The username, password, and sanitized URL parsed from the proxy URL, or null when absent.
 */
function resolveEmbeddedCredentials(proxyUrl: string | undefined) {
  return proxyUrl ? getUrlCredentials(proxyUrl) : null;
}

/**
 * Extract a human-readable reason string from a settled promise result.
 * @param result - The result.
 * @returns A reason string from the settled promise, or null if unavailable.
 */
function toSettledReason(result: PromiseSettledResult<string>): string {
  if (result.status === "fulfilled") {
    return "Exit IP check completed without an error.";
  }

  return result.reason instanceof Error
    ? result.reason.message
    : "Exit IP check failed.";
}

/**
 * Validate that a public IP endpoint URL is safe to contact.
 * @param candidateUrl - The candidate url.
 * @returns Whether validate public ip endpoint.
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
