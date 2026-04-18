import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, users } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ensureProxyUrlHasExplicitPort, getUrlCredentials } from "@/lib/utils";

import type {
  NormalizedProxySubmission,
  ProxySettingsRequestBody,
  SavedProxyRecord,
  SavedProxyView,
} from "./submission-contracts";

import {
  encryptStoredProxyPassword,
  materializeStoredProxyPassword,
} from "./credentials";
import {
  MAX_PROXY_CREDENTIAL_LENGTH,
  MAX_PROXY_URL_LENGTH,
  type ProxyStatus,
} from "./transport";

/**
 * Process the configured response with error.
 * @param proxyUrl - The proxy url.
 * @param allowInsecureTls - The allow insecure tls.
 * @param proxyUsername - The proxy username.
 * @param hasProxyPassword - Whether has proxy password.
 * @param error - The error.
 * @returns The configured response with error.
 */
export function configuredResponseWithError(
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
    routingCheck: null,
    status: "unreachable" as ProxyStatus,
  });
}

/**
 * Create the stored password updater.
 * @param userId - The r id.
 * @returns The stored password updater.
 */
export function createStoredPasswordUpdater(userId: number) {
  return async (normalizedStoredPassword: null | string) => {
    await getDb()
      .update(users)
      .set({ proxyPassword: normalizedStoredPassword })
      .where(eq(users.id, userId));
  };
}

/**
 * Normalize the proxy submission.
 * @param body - The body.
 * @returns The proxy submission.
 */
export function normalizeProxySubmission(
  body: ProxySettingsRequestBody,
): NormalizedProxySubmission {
  const rawProxyUrl = normalizeProxyUrlValue(body.proxyUrl);

  return {
    allowInsecureTls:
      typeof body.allowInsecureTls === "boolean"
        ? body.allowInsecureTls
        : undefined,
    embeddedCredentials: rawProxyUrl ? getUrlCredentials(rawProxyUrl) : null,
    proxyPassword: normalizeOptionalProxyPassword(body.proxyPassword),
    proxyUrl: rawProxyUrl,
    proxyUsername: normalizeOptionalProxyCredential(body.proxyUsername),
    rawProxyUrl,
  };
}

/**
 * Resolve the materialized proxy password.
 * @param userId - The r id.
 * @param storedProxyPassword - The stored proxy password.
 * @returns The materialized proxy password.
 */
export async function resolveMaterializedProxyPassword(
  userId: number,
  storedProxyPassword: null | string,
): Promise<null | Response | string> {
  try {
    return await materializeStoredProxyPassword(
      storedProxyPassword,
      createStoredPasswordUpdater(userId),
    );
  } catch (error) {
    logger.error("Saved proxy password could not be materialized", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return new Response(null, { status: 500 });
  }
}

/**
 * Resolve the saved proxy view.
 * @param savedProxy - The saved proxy.
 * @returns The saved proxy view.
 */
export function resolveSavedProxyView(
  savedProxy: null | SavedProxyRecord,
): null | SavedProxyView {
  const rawProxyUrl = savedProxy?.proxyUrl?.trim() ?? "";
  if (!rawProxyUrl) {
    return null;
  }

  const canonicalProxyUrl = ensureProxyUrlHasExplicitPort(rawProxyUrl);
  const embeddedCredentials = getUrlCredentials(canonicalProxyUrl);

  return {
    allowInsecureTls: savedProxy?.allowInsecureTls ?? false,
    fallbackPassword: embeddedCredentials?.password ?? null,
    hasProxyPassword: hasSavedProxyPassword(
      savedProxy,
      embeddedCredentials?.password,
    ),
    proxyUrl: embeddedCredentials?.sanitizedUrl ?? canonicalProxyUrl,
    proxyUsername:
      savedProxy?.proxyUsername ?? embeddedCredentials?.username ?? null,
    storedProxyPassword: savedProxy?.proxyPassword ?? null,
  };
}

/**
 * Resolve the stored proxy password value.
 * @param proxyPassword - The proxy password.
 * @param userId - The r id.
 * @returns The stored proxy password value.
 */
export function resolveStoredProxyPasswordValue(
  proxyPassword: null | string | undefined,
  userId: number,
): null | Response | string | undefined {
  if (proxyPassword === undefined || proxyPassword === null) {
    return proxyPassword;
  }

  try {
    return encryptStoredProxyPassword(proxyPassword);
  } catch (error) {
    logger.error("Proxy password encryption failed", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return unconfiguredResponse(
      "Proxy password encryption is not configured correctly on this deployment.",
    );
  }
}

/**
 * Process the unconfigured response.
 * @param error - The error.
 * @returns The unconfigured response.
 */
export function unconfiguredResponse(error?: string): Response {
  return NextResponse.json({
    allowInsecureTls: false,
    configured: false,
    hasProxyPassword: false,
    proxyUrl: null,
    proxyUsername: null,
    routingCheck: null,
    status: "unreachable" as ProxyStatus,
    ...(error && { error }),
  });
}

/**
 * Process the validate proxy submission.
 * @param body - The body.
 * @param submission - The submission.
 * @returns The validate proxy submission.
 */
export function validateProxySubmission(
  body: ProxySettingsRequestBody,
  submission: NormalizedProxySubmission,
): null | string {
  if (hasConflictingProxyCredentials(submission)) {
    return "Provide proxy credentials either in the dedicated username/password fields or in the URL, but not both.";
  }

  return (
    validateProxyUrlLength(submission.rawProxyUrl) ??
    validateProxyCredentialLength(body.proxyUsername, "username") ??
    validateProxyCredentialLength(body.proxyPassword, "password")
  );
}

/**
 * Return whether has conflicting proxy credentials.
 * @param submission - The submission.
 * @returns Whether has conflicting proxy credentials.
 */
function hasConflictingProxyCredentials(submission: NormalizedProxySubmission) {
  const hasEmbeddedProxyCredentials =
    submission.embeddedCredentials !== null &&
    (submission.embeddedCredentials.username !== null ||
      submission.embeddedCredentials.password !== null);

  return (
    hasEmbeddedProxyCredentials &&
    (submission.proxyUsername !== undefined ||
      submission.proxyPassword !== undefined)
  );
}

/**
 * Return whether has saved proxy password.
 * @param savedProxy - The saved proxy.
 * @param embeddedPassword - The embedded password.
 * @returns Whether has saved proxy password.
 */
function hasSavedProxyPassword(
  savedProxy: null | SavedProxyRecord,
  embeddedPassword: null | string | undefined,
) {
  return savedProxy?.proxyPassword !== null || embeddedPassword !== null;
}

/**
 * Normalize the optional proxy credential.
 * @param value - The value.
 * @returns The optional proxy credential.
 */
function normalizeOptionalProxyCredential(
  value: null | string | undefined,
): null | string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return value === null || value === "" ? null : undefined;
}

/**
 * Normalize the optional proxy password.
 * @param value - The value.
 * @returns The optional proxy password.
 */
function normalizeOptionalProxyPassword(
  value: null | string | undefined,
): null | string | undefined {
  if (typeof value === "string" && value) {
    return value;
  }

  return value === null || value === "" ? null : undefined;
}

/**
 * Normalize the proxy url value.
 * @param proxyUrl - The proxy url.
 * @returns The proxy url value.
 */
function normalizeProxyUrlValue(proxyUrl: null | string | undefined) {
  const trimmedProxyUrl = typeof proxyUrl === "string" ? proxyUrl.trim() : null;
  return trimmedProxyUrl &&
    trimmedProxyUrl !== "null" &&
    trimmedProxyUrl !== "undefined"
    ? trimmedProxyUrl
    : null;
}

/**
 * Process the validate proxy credential length.
 * @param value - The value.
 * @param fieldName - The field name.
 * @returns The validate proxy credential length.
 */
function validateProxyCredentialLength(
  value: null | string | undefined,
  fieldName: "password" | "username",
) {
  if (
    typeof value !== "string" ||
    value.length <= MAX_PROXY_CREDENTIAL_LENGTH
  ) {
    return null;
  }

  return `Proxy ${fieldName} too long`;
}

/**
 * Process the validate proxy url length.
 * @param rawProxyUrl - The raw proxy url.
 * @returns The validate proxy url length.
 */
function validateProxyUrlLength(rawProxyUrl: null | string) {
  if (!rawProxyUrl || rawProxyUrl.length <= MAX_PROXY_URL_LENGTH) {
    return null;
  }

  logger.error("Proxy URL exceeds max length", {
    length: rawProxyUrl.length,
    max: MAX_PROXY_URL_LENGTH,
  });
  return "Proxy URL too long";
}
