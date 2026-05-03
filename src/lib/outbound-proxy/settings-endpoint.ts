import type { NextRequest } from "next/server";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

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

/**
 * Describes the authorized proxy request.
 */
interface AuthorizedProxyRequest {
  auth: serverApi.AuthenticatedUser;
  detect: (host: string, port: number) => Promise<"http" | "socks5">;
  dnsCheck: (host: string) => Promise<boolean>;
  getProxyRoutingCheck: ProxyRoutingCheckFn;
  probe: (url: string) => Promise<boolean>;
}

/**
 * Describes the options for persist authorized proxy submission.
 */
interface PersistAuthorizedProxySubmissionOptions {
  auth: serverApi.AuthenticatedUser;
  proxyUrl: null | string;
  submission: NormalizedProxySubmission;
}

/**
 * Describes the options for persisted proxy probe response.
 */
interface PersistedProxyProbeResponseOptions {
  authorized: AuthorizedProxyRequest;
  persistedProxy: PersistedProxyRow;
  proxyPassword: null | string;
  proxyUrl: string;
}

/**
 * Describes the persist proxy settings values.
 */
interface PersistProxySettingsValues {
  allowInsecureTls?: boolean;
  proxyPassword?: null | string;
  proxyUrl: null | string;
  proxyUsername?: null | string;
}
/**
 * Describes the options for probe and respond.
 */
interface ProbeAndRespondOptions {
  allowInsecureTls?: boolean;
  getProxyRoutingCheckFn: ProxyRoutingCheckFn;
  logLabel: string;
  probe: (url: string) => Promise<boolean>;
  proxyPassword?: null | string;
  proxyUrl: string;
  proxyUsername?: null | string;
}

/**
 * Defines the proxy routing check fn type.
 */
type ProxyRoutingCheckFn = (options: {
  allowInsecureTls: boolean;
  proxyUrl: string;
}) => Promise<ProxyRoutingCheckResult>;
/**
 * Describes the options for respond with saved password read error.
 */
interface RespondWithSavedPasswordReadErrorOptions {
  allowInsecureTls: boolean;
  hasProxyPassword: boolean;
  proxyUrl: null | string;
  proxyUsername: null | string;
}

/**
 * Describes the options for response proxy password.
 */
interface ResponseProxyPasswordOptions {
  effectiveProxyPassword: null | string | undefined;
  persistedProxyPassword: null | string;
  userId: number;
}
/**
 * Process the handle proxy settings get.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The handle proxy settings get.
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
 * Process the handle proxy settings put.
 * @param request - The request.
 * @param body - The body.
 * @param depsOrContext - The deps or context.
 * @returns The handle proxy settings put.
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
 * Build the persisted proxy probe response.
 * @param options - The options used to build the persisted proxy probe response.
 * @returns The persisted proxy probe response.
 */
function buildPersistedProxyProbeResponse(
  options: PersistedProxyProbeResponseOptions,
) {
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
 * Process the persist authorized proxy submission.
 * @param options - The options used to process the persist authorized proxy submission.
 * @returns The persist authorized proxy submission.
 */
async function persistAuthorizedProxySubmission(
  options: PersistAuthorizedProxySubmissionOptions,
) {
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
 * Process the persist proxy settings.
 * @param userId - The r id.
 * @param values - The values.
 * @returns The persist proxy settings.
 */
async function persistProxySettings(
  userId: number,
  values: PersistProxySettingsValues,
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
 * Process the probe and respond.
 * @param options - The options used to process the probe and respond.
 * @returns The probe and respond.
 */
async function probeAndRespond(
  options: ProbeAndRespondOptions,
): Promise<Response> {
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
 * Process the read saved proxy record.
 * @param userId - The r id.
 * @returns The read saved proxy record.
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
 * Resolve the authorized proxy request.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The authorized proxy request.
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
 * Resolve the normalized proxy url.
 * @param submission - The submission.
 * @param authorized - The authorized.
 * @returns The normalized proxy url.
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
 * Resolve the response proxy password.
 * @param options - The options used to resolve the response proxy password.
 * @returns The response proxy password.
 */
async function resolveResponseProxyPassword(
  options: ResponseProxyPasswordOptions,
): Promise<null | Response | string> {
  const persistedPassword = await resolveMaterializedProxyPassword(
    options.userId,
    options.persistedProxyPassword,
  );
  if (persistedPassword instanceof Response) {
    return persistedPassword;
  }

  if (options.effectiveProxyPassword !== undefined) {
    return options.effectiveProxyPassword;
  }

  return persistedPassword;
}
/**
 * Resolve the routing check.
 * @param getProxyRoutingCheckFn - The proxy routing check fn.
 * @param allowInsecureTls - The allow insecure tls.
 * @param proxyUrl - The proxy url.
 * @returns The routing check.
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
 * Process the respond with saved password read error.
 * @param options - The options used to process the respond with saved password read error.
 * @returns The respond with saved password read error.
 */
function respondWithSavedPasswordReadError(
  options: RespondWithSavedPasswordReadErrorOptions,
) {
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
