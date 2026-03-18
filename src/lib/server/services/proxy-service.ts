/**
 * Server-side proxy operations shared across API surfaces.
 *
 * The {@link resolveUserProxy} function is the canonical way to obtain a
 * ready-to-use proxy URL with credentials for a given user. It is used by the
 * article extraction pipeline, compatibility checks, and proxy status routes.
 */
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  getUrlCredentials,
  injectProxyCredentials,
  stripUrlCredentials,
} from "@/lib/utils/url";

import { probeProxy } from "../proxy";
import { materializeStoredProxyPassword } from "../proxy-credentials";
import { ServiceError } from "./errors";

export interface ProxyStatusResult {
  configured: boolean;
  proxyUrl: null | string;
  status: "reachable" | "unreachable";
}

export interface ResolvedUserProxy {
  allowInsecureTls: boolean;
  proxyUrl: string | undefined;
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

  const reachable = await probeProxy(rawProxyUrl);
  const status = reachable ? "reachable" : "unreachable";
  if (!reachable) {
    logger.error("Proxy status check: unreachable", {
      proxyUrl: stripUrlCredentials(rawProxyUrl),
    });
  }
  return {
    configured: true,
    proxyUrl: stripUrlCredentials(rawProxyUrl),
    status,
  };
}

/**
 * Resolves the fully-qualified proxy URL (with injected credentials) for a
 * user. Returns `undefined` proxy URL when the user has no proxy configured.
 *
 * Throws {@link ServiceError} when stored credentials cannot be materialized.
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
  const embeddedCredentials = rawProxyUrl
    ? getUrlCredentials(rawProxyUrl)
    : null;
  const baseProxyUrl =
    rawProxyUrl !== undefined &&
    rawProxyUrl !== "" &&
    rawProxyUrl !== "null" &&
    rawProxyUrl !== "undefined"
      ? (embeddedCredentials?.sanitizedUrl ?? rawProxyUrl)
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
    throw new ServiceError(
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
