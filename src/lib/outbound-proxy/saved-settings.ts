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

export function createStoredPasswordUpdater(userId: number) {
  return async (normalizedStoredPassword: null | string) => {
    await getDb()
      .update(users)
      .set({ proxyPassword: normalizedStoredPassword })
      .where(eq(users.id, userId));
  };
}

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

function hasSavedProxyPassword(
  savedProxy: null | SavedProxyRecord,
  embeddedPassword: null | string | undefined,
) {
  return savedProxy?.proxyPassword !== null || embeddedPassword !== null;
}

function normalizeOptionalProxyCredential(
  value: null | string | undefined,
): null | string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return value === null || value === "" ? null : undefined;
}

function normalizeOptionalProxyPassword(
  value: null | string | undefined,
): null | string | undefined {
  if (typeof value === "string" && value) {
    return value;
  }

  return value === null || value === "" ? null : undefined;
}

function normalizeProxyUrlValue(proxyUrl: null | string | undefined) {
  const trimmedProxyUrl = typeof proxyUrl === "string" ? proxyUrl.trim() : null;
  return trimmedProxyUrl &&
    trimmedProxyUrl !== "null" &&
    trimmedProxyUrl !== "undefined"
    ? trimmedProxyUrl
    : null;
}

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
