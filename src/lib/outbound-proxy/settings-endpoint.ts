import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb, users } from "@/lib/db";
import { logger } from "@/lib/logger";
import { serverApi } from "@/lib/server";
import { injectProxyCredentials, redactUrlForLogs } from "@/lib/utils";

import type {
  NormalizedProxySubmission,
  PersistedProxyRow,
  ProxyRouteDeps,
  ProxySettingsRequestBody,
  SavedProxyRecord,
} from "./submission-contracts";

import {
  resolveAuthorizedProxyDeps,
  resolveEffectiveProxyCredentials,
} from "./authorized-deps";
import {
  configuredResponseWithError,
  normalizeProxySubmission,
  resolveMaterializedProxyPassword,
  resolveSavedProxyView,
  resolveStoredProxyPasswordValue,
  unconfiguredResponse,
  validateProxySubmission,
} from "./saved-settings";
import { type ProxyRoutingCheckResult } from "./service";
import { normalizeProxyUrl, type ProxyStatus } from "./transport";

interface AuthorizedProxyRequest {
  auth: serverApi.AuthenticatedUser;
  detect: (host: string, port: number) => Promise<"http" | "socks5">;
  dnsCheck: (host: string) => Promise<boolean>;
  getProxyRoutingCheck: ProxyRoutingCheckFn;
  probe: (url: string) => Promise<boolean>;
}

type ProxyRoutingCheckFn = (options: {
  allowInsecureTls: boolean;
  proxyUrl: string;
}) => Promise<ProxyRoutingCheckResult>;

/**
 * @param request
 * @param depsOrContext
 */
export async function handleProxySettingsGet(
  request: NextRequest,
  depsOrContext: ProxyRouteDeps | serverApi.RouteHandlerContext = {},
): Promise<Response> {
  const authorized = await resolveAuthorizedProxyRequest(
    request,
    depsOrContext,
  );
  if (authorized instanceof Response) return authorized;

  const savedProxy = await readSavedProxyRecord(authorized.auth.userId);
  const savedProxyView = resolveSavedProxyView(savedProxy);
  if (savedProxyView === null) return unconfiguredResponse();

  const materializedPassword = await resolveMaterializedProxyPassword(
    authorized.auth.userId,
    savedProxyView.storedProxyPassword,
  );
  if (materializedPassword instanceof Response) {
    return respondWithSavedPasswordReadError({
      allowInsecureTls: savedProxyView.allowInsecureTls,
      hasProxyPassword: savedProxyView.hasProxyPassword,
      proxyUrl: savedProxyView.proxyUrl,
      proxyUsername: savedProxyView.proxyUsername,
    });
  }

  return probeAndRespond({
    allowInsecureTls: savedProxyView.allowInsecureTls,
    getProxyRoutingCheckFn: authorized.getProxyRoutingCheck,
    logLabel: "Proxy unreachable on GET",
    probe: authorized.probe,
    proxyPassword: materializedPassword ?? savedProxyView.fallbackPassword,
    proxyUrl: savedProxyView.proxyUrl,
    proxyUsername: savedProxyView.proxyUsername,
  });
}

/**
 * @param request
 * @param body
 * @param depsOrContext
 */
export async function handleProxySettingsPut(
  request: NextRequest,
  body: ProxySettingsRequestBody,
  depsOrContext: ProxyRouteDeps | serverApi.RouteHandlerContext = {},
): Promise<Response> {
  const authorized = await resolveAuthorizedProxyRequest(
    request,
    depsOrContext,
  );
  if (authorized instanceof Response) return authorized;

  const submission = normalizeProxySubmission(body);
  const validationError = validateProxySubmission(body, submission);
  if (validationError) return unconfiguredResponse(validationError);

  const proxyUrl = await resolveNormalizedProxyUrl(submission, authorized);
  if (proxyUrl instanceof Response) return proxyUrl;
  const persistedSubmission = await persistAuthorizedProxySubmission({
    auth: authorized.auth,
    proxyUrl,
    submission,
  });
  if (persistedSubmission instanceof Response) return persistedSubmission;

  const responsePassword = await resolveResponseProxyPassword({
    effectiveProxyPassword: persistedSubmission.effectiveProxyPassword,
    persistedProxyPassword: persistedSubmission.persistedProxy.proxyPassword,
    userId: authorized.auth.userId,
  });
  if (responsePassword instanceof Response) {
    return respondWithSavedPasswordReadError({
      allowInsecureTls: persistedSubmission.persistedProxy.allowInsecureTls,
      hasProxyPassword:
        persistedSubmission.persistedProxy.proxyPassword !== null,
      proxyUrl,
      proxyUsername: persistedSubmission.persistedProxy.proxyUsername,
    });
  }

  if (!proxyUrl) return unconfiguredResponse();
  return buildPersistedProxyProbeResponse({
    authorized,
    persistedProxy: persistedSubmission.persistedProxy,
    proxyPassword: responsePassword,
    proxyUrl,
  });
}

/**
 * @param options
 * @param options.authorized
 * @param options.persistedProxy
 * @param options.proxyPassword
 * @param options.proxyUrl
 */
function buildPersistedProxyProbeResponse(options: {
  authorized: AuthorizedProxyRequest;
  persistedProxy: PersistedProxyRow;
  proxyPassword: null | string;
  proxyUrl: string;
}) {
  return probeAndRespond({
    allowInsecureTls: options.persistedProxy.allowInsecureTls,
    getProxyRoutingCheckFn: options.authorized.getProxyRoutingCheck,
    logLabel: "Proxy saved but unreachable",
    probe: options.authorized.probe,
    proxyPassword: options.proxyPassword,
    proxyUrl: options.proxyUrl,
    proxyUsername: options.persistedProxy.proxyUsername,
  });
}

/**
 * @param options
 * @param options.auth
 * @param options.proxyUrl
 * @param options.submission
 */
async function persistAuthorizedProxySubmission(options: {
  auth: serverApi.AuthenticatedUser;
  proxyUrl: null | string;
  submission: NormalizedProxySubmission;
}) {
  const { effectiveProxyPassword, effectiveProxyUsername } =
    resolveEffectiveProxyCredentials(options.submission);
  const storedProxyPassword = resolveStoredProxyPasswordValue(
    effectiveProxyPassword,
    options.auth.userId,
  );

  if (storedProxyPassword instanceof Response) {
    return storedProxyPassword;
  }

  const persistedProxy = await persistProxySettings(options.auth.userId, {
    allowInsecureTls: options.submission.allowInsecureTls,
    proxyPassword: storedProxyPassword,
    proxyUrl: options.proxyUrl,
    proxyUsername: effectiveProxyUsername,
  });

  return { effectiveProxyPassword, persistedProxy };
}

/**
 * @param userId
 * @param values
 * @param values.allowInsecureTls
 * @param values.proxyPassword
 * @param values.proxyUrl
 * @param values.proxyUsername
 */
async function persistProxySettings(
  userId: number,
  values: {
    allowInsecureTls?: boolean;
    proxyPassword?: null | string;
    proxyUrl: null | string;
    proxyUsername?: null | string;
  },
): Promise<PersistedProxyRow> {
  const rows = await getDb()
    .update(users)
    .set({
      proxyUrl: values.proxyUrl,
      ...(values.allowInsecureTls !== undefined && {
        allowInsecureTls: values.allowInsecureTls,
      }),
      ...(values.proxyPassword !== undefined && {
        proxyPassword: values.proxyPassword,
      }),
      ...(values.proxyUsername !== undefined && {
        proxyUsername: values.proxyUsername,
      }),
    })
    .where(eq(users.id, userId))
    .returning({
      allowInsecureTls: users.allowInsecureTls,
      proxyPassword: users.proxyPassword,
      proxyUsername: users.proxyUsername,
    });

  return (
    rows[0] ?? {
      allowInsecureTls: false,
      proxyPassword: null,
      proxyUsername: null,
    }
  );
}

/**
 * @param options
 * @param options.allowInsecureTls
 * @param options.getProxyRoutingCheckFn
 * @param options.logLabel
 * @param options.probe
 * @param options.proxyPassword
 * @param options.proxyUrl
 * @param options.proxyUsername
 */
async function probeAndRespond(options: {
  allowInsecureTls?: boolean;
  getProxyRoutingCheckFn: ProxyRoutingCheckFn;
  logLabel: string;
  probe: (url: string) => Promise<boolean>;
  proxyPassword?: null | string;
  proxyUrl: string;
  proxyUsername?: null | string;
}): Promise<Response> {
  const proxyPassword = options.proxyPassword ?? null;
  const proxyUsername = options.proxyUsername ?? null;
  const transportProxyUrl =
    proxyUsername && proxyPassword
      ? injectProxyCredentials(options.proxyUrl, proxyUsername, proxyPassword)
      : options.proxyUrl;
  const reachable = await options.probe(transportProxyUrl);

  if (!reachable) {
    logger.error(options.logLabel, {
      proxyUrl: redactUrlForLogs(options.proxyUrl),
    });
  }

  return NextResponse.json({
    allowInsecureTls: options.allowInsecureTls ?? false,
    configured: true,
    hasProxyPassword: proxyPassword !== null,
    proxyUrl: options.proxyUrl,
    proxyUsername,
    routingCheck: reachable
      ? await resolveRoutingCheck(
          options.getProxyRoutingCheckFn,
          options.allowInsecureTls ?? false,
          transportProxyUrl,
        )
      : null,
    status: (reachable ? "reachable" : "unreachable") as ProxyStatus,
  });
}

/**
 * @param userId
 */
async function readSavedProxyRecord(
  userId: number,
): Promise<null | SavedProxyRecord> {
  const rows = await getDb()
    .select({
      allowInsecureTls: users.allowInsecureTls,
      proxyPassword: users.proxyPassword,
      proxyUrl: users.proxyUrl,
      proxyUsername: users.proxyUsername,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * @param request
 * @param depsOrContext
 */
async function resolveAuthorizedProxyRequest(
  request: NextRequest,
  depsOrContext: ProxyRouteDeps | serverApi.RouteHandlerContext,
): Promise<AuthorizedProxyRequest | Response> {
  const deps = serverApi.resolveRouteHandlerDeps<ProxyRouteDeps>(depsOrContext);
  const authorizedDeps = resolveAuthorizedProxyDeps(deps);
  const auth = await authorizedDeps.requireAuth(request);
  if (auth instanceof Response) return auth;

  return {
    auth,
    detect: authorizedDeps.detect,
    dnsCheck: authorizedDeps.dnsCheck,
    getProxyRoutingCheck: authorizedDeps.getProxyRoutingCheck,
    probe: authorizedDeps.probe,
  };
}

/**
 * @param submission
 * @param authorized
 */
async function resolveNormalizedProxyUrl(
  submission: NormalizedProxySubmission,
  authorized: AuthorizedProxyRequest,
): Promise<null | Response | string> {
  if (!submission.proxyUrl) return null;

  const normalized = await normalizeProxyUrl(
    submission.proxyUrl,
    authorized.detect,
    authorized.dnsCheck,
  );
  if (normalized) return normalized;

  logger.error("Invalid proxy URL submitted", {
    raw: redactUrlForLogs(submission.proxyUrl),
  });
  return unconfiguredResponse(
    "Invalid proxy URL. Accepted formats: http://host:port, socks5://host:port, or bare host:port",
  );
}

/**
 * @param options
 * @param options.effectiveProxyPassword
 * @param options.persistedProxyPassword
 * @param options.userId
 */
async function resolveResponseProxyPassword(options: {
  effectiveProxyPassword: null | string | undefined;
  persistedProxyPassword: null | string;
  userId: number;
}): Promise<null | Response | string> {
  if (options.effectiveProxyPassword !== undefined) {
    return options.effectiveProxyPassword;
  }

  return resolveMaterializedProxyPassword(
    options.userId,
    options.persistedProxyPassword,
  );
}

/**
 * @param getProxyRoutingCheckFn
 * @param allowInsecureTls
 * @param proxyUrl
 */
async function resolveRoutingCheck(
  getProxyRoutingCheckFn: ProxyRoutingCheckFn,
  allowInsecureTls: boolean,
  proxyUrl: string,
): Promise<ProxyRoutingCheckResult> {
  try {
    return await getProxyRoutingCheckFn({ allowInsecureTls, proxyUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Exit IP check failed.";

    logger.error("Proxy routing check failed", {
      error: message,
      proxyUrl: redactUrlForLogs(proxyUrl),
    });

    return {
      directIp: null,
      error: message,
      proxyExitIp: null,
      status: "error",
    };
  }
}

/**
 * @param options
 * @param options.allowInsecureTls
 * @param options.hasProxyPassword
 * @param options.proxyUrl
 * @param options.proxyUsername
 */
function respondWithSavedPasswordReadError(options: {
  allowInsecureTls: boolean;
  hasProxyPassword: boolean;
  proxyUrl: null | string;
  proxyUsername: null | string;
}) {
  if (!options.proxyUrl) {
    return unconfiguredResponse();
  }

  return configuredResponseWithError(
    options.proxyUrl,
    options.allowInsecureTls,
    options.proxyUsername,
    options.hasProxyPassword,
    "Saved proxy password could not be read. Save it again to continue using authenticated proxy access.",
  );
}
