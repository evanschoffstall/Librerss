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
 * Build a JSON response for a configured but unreachable proxy, including the error message.
 * @param proxyUrl - The proxy url.
 * @param proxyUsername - The proxy username.
 * @param hasProxyPassword - Whether a proxy password is currently stored.
 * @param error - The error.
 * @returns A 200 JSON response indicating the proxy is configured but currently unreachable.
 */
export function configuredResponseWithError(
  proxyUrl: string,
  proxyUsername: null | string,
  hasProxyPassword: boolean,
  error: string,
): Response {
  return NextResponse.json({
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
 * Create a function that persists a new normalized proxy password for the given user.
 * @param userId - The user ID.
 * @returns An async function that writes the normalized password to the database.
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
 * Normalize and extract fields from the raw proxy settings request body.
 * @param body - The body.
 * @returns The normalized proxy submission with extracted and validated credential fields.
 */
export function normalizeProxySubmission(
  body: ProxySettingsRequestBody,
): NormalizedProxySubmission {
  const rawProxyUrl = normalizeProxyUrlValue(body.proxyUrl);

  return {
    embeddedCredentials: rawProxyUrl ? getUrlCredentials(rawProxyUrl) : null,
    proxyPassword: normalizeOptionalProxyPassword(body.proxyPassword),
    proxyUrl: rawProxyUrl,
    proxyUsername: normalizeOptionalProxyCredential(body.proxyUsername),
    rawProxyUrl,
  };
}

/**
 * Decrypt and return the stored proxy password, refreshing it if needed.
 * @param userId - The user ID.
 * @param storedProxyPassword - The stored proxy password.
 * @returns The plaintext password string, a 500 error response on decryption failure, or null if no password is stored.
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
 * Build the view-layer representation of the saved proxy settings.
 * @param savedProxy - The saved proxy.
 * @returns The view object for the UI, or null if no proxy URL is configured.
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
 * Encrypt the given proxy password for storage, or validate a clear/remove intent.
 * @param proxyPassword - The proxy password.
 * @param userId - The user ID.
 * @returns The encrypted password string, null to clear it, undefined to leave it unchanged, or a 500 error response on failure.
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
 * Build a JSON response for a proxy that has not yet been configured.
 * @param error - The error.
 * @returns A 200 JSON response with all proxy fields absent and configured: false.
 */
export function unconfiguredResponse(error?: string): Response {
  return NextResponse.json({
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
 * Validate the normalized proxy submission for credential conflicts and field-length constraints.
 * @param body - The body.
 * @param submission - The submission.
 * @returns A validation error message, or null if the submission passes all checks.
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
 * Return whether the submission mixes URL-embedded credentials with explicit field credentials.
 * @param submission - The submission.
 * @returns True if both embedded and explicit credentials are present.
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
 * Return whether a proxy password exists in the record or embedded in the URL.
 * @param savedProxy - The saved proxy.
 * @param embeddedPassword - The embedded password.
 * @returns True if a stored or embedded proxy password is present.
 */
function hasSavedProxyPassword(
  savedProxy: null | SavedProxyRecord,
  embeddedPassword: null | string | undefined,
) {
  return savedProxy?.proxyPassword !== null || embeddedPassword !== null;
}

/**
 * Trim the credential value, coercing blank strings and explicit nulls to null.
 * @param value - The value.
 * @returns The trimmed credential, null to clear it, or undefined to leave it unchanged.
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
 * Normalize the password value, coercing blank strings and explicit nulls to null.
 * @param value - The value.
 * @returns The password string, null to clear it, or undefined to leave it unchanged.
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
 * Trim and sanitize the raw proxy URL, treating blank/sentinel strings as absent.
 * @param proxyUrl - The proxy url.
 * @returns The trimmed URL string, or null if it was blank, "null", or "undefined".
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
 * Return an error string if the credential value exceeds the maximum allowed length.
 * @param value - The value.
 * @param fieldName - The field name.
 * @returns A human-readable error string if the credential is too long, or null if it is within limits.
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
 * Return an error string if the proxy URL exceeds the maximum allowed length.
 * @param rawProxyUrl - The raw proxy url.
 * @returns A human-readable error string if the URL is too long, or null if it is within limits.
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
