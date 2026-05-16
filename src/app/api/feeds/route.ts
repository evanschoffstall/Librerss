import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import type {
  createOrUpdateFeedSource,
  deleteFeedSourceForUser,
  renameFeedSourceForUser,
  setFeedSourceEnabledForUser,
  updateFeedSettingsForUser,
} from "@/lib/api/feed-source-api";
import type { getDb } from "@/lib/db";

import { CONFIG, logger } from "@/lib";
import {
  assertAllowedFeedUrl,
  getRequestedFeedUrl,
  handleFeedRead,
  parseCreateFeedPayload,
  parseDeleteSourceId,
  parseRenameFeedPayloadFromBody,
  parseToggleFeedEnabledPayloadFromBody,
  parseUpdateFeedSettingsPayloadFromBody,
} from "@/lib/api/feed-source-api";
import {
  isVerboseLoggingEnabled,
  jsonError,
  parseJsonObjectBodyOrResponse,
} from "@/lib/api/http";
import {
  isFeedSourceNotFoundError,
  isUpstreamFeedError,
} from "@/lib/core/server";
import {
  createFeed,
  deleteFeed,
  renameFeed,
  requireMutableFeedAccess,
  serverApi,
  setFeedEnabled,
  updateFeedSettings,
} from "@/lib/server";
import { toErrorMessage } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UPSTREAM_FEED_ERROR_MESSAGE = "Failed to fetch feed from upstream";

/**
 * Describes the feed route deps.
 */
interface FeedRouteDeps {
  assertAllowedFeedUrlFn?: typeof assertAllowedFeedUrl;
  createOrUpdateFeedSourceFn?: typeof createOrUpdateFeedSource;
  deleteFeedSourceForUserFn?: typeof deleteFeedSourceForUser;
  getDbFn?: typeof getDb;
  getRequestedFeedUrlFn?: typeof getRequestedFeedUrl;
  handleFeedReadFn?: typeof handleFeedRead;
  isFeedSourceNotFoundErrorFn?: typeof isFeedSourceNotFoundError;
  isUpstreamFeedErrorFn?: typeof isUpstreamFeedError;
  jsonErrorFn?: typeof jsonError;
  logAndRespondErrorFn?: typeof serverApi.logAndRespondError;
  parseCreateFeedPayloadFn?: typeof parseCreateFeedPayload;
  parseDeleteSourceIdFn?: typeof parseDeleteSourceId;
  parseRenameFeedPayloadFn?: (
    request: NextRequest,
  ) => Promise<Response | { name: string; sourceId: number; url: string }>;
  parseRenameFeedPayloadFromBodyFn?: typeof parseRenameFeedPayloadFromBody;
  parseToggleFeedEnabledPayloadFromBodyFn?: typeof parseToggleFeedEnabledPayloadFromBody;
  parseUpdateFeedSettingsPayloadFromBodyFn?: typeof parseUpdateFeedSettingsPayloadFromBody;
  renameFeedSourceForUserFn?: typeof renameFeedSourceForUser;
  requireAuthenticatedUserFn?: typeof serverApi.requireAuthenticatedUser;
  requireMutableFeedAccessFn?: typeof requireMutableFeedAccess;
  setFeedSourceEnabledForUserFn?: typeof setFeedSourceEnabledForUser;
  toErrorMessageFn?: typeof toErrorMessage;
  updateFeedSettingsForUserFn?: typeof updateFeedSettingsForUser;
  warnFn?: typeof logger.warn;
}

/**
 * Defines the feed route warn type.
 */
type FeedRouteWarn = (
  message: string,
  context?: Record<string, unknown>,
) => void;

/**
 * Describes the rename feed source from payload parsed payload.
 */
interface RenameFeedSourceFromPayloadParsedPayload {
  name: string;
  sourceId: number;
  url: string;
}

/**
 * Describes the resolved feed route deps.
 */
interface ResolvedFeedRouteDeps {
  assertAllowedUrl: typeof assertAllowedFeedUrl;
  parseCreatePayload: typeof parseCreateFeedPayload;
  parseDeleteId: typeof parseDeleteSourceId;
  parseRenamePayload?: FeedRouteDeps["parseRenameFeedPayloadFn"];
  parseRenamePayloadFromBody: typeof parseRenameFeedPayloadFromBody;
  parseToggleEnabledPayloadFromBody: typeof parseToggleFeedEnabledPayloadFromBody;
  parseUpdateSettingsFromBody: typeof parseUpdateFeedSettingsPayloadFromBody;
  readFeed: typeof handleFeedRead;
  requestedFeedUrl: typeof getRequestedFeedUrl;
  requireAuth: typeof serverApi.requireAuthenticatedUser;
  requireMutable: typeof requireMutableFeedAccess;
  respondError: typeof serverApi.logAndRespondError;
}

/**
 * Render the delete component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered delete component.
 */
export async function DELETE(
  request: NextRequest,
  depsOrContext: FeedRouteDeps | serverApi.RouteHandlerContext = {},
) {
  const { deps, resolvedDeps, user } = await requireMutableFeedRouteContext(
    request,
    depsOrContext,
  );

  try {
    if (user instanceof Response) return user;

    const sourceId = resolvedDeps.parseDeleteId(request);
    if (sourceId instanceof Response) return sourceId;

    const deletedSource = await deleteFeed(user.userId, sourceId, {
      deleteFeedSourceForUserFn: deps.deleteFeedSourceForUserFn,
    });
    return NextResponse.json(deletedSource);
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError) {
      return toServerServiceErrorResponse(error, deps);
    }

    return resolvedDeps.respondError("Error deleting feed source", error);
  }
}

/**
 * Render the get component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered get component.
 */
export async function GET(
  request: NextRequest,
  depsOrContext: FeedRouteDeps | serverApi.RouteHandlerContext = {},
) {
  const deps = serverApi.resolveRouteHandlerDeps<FeedRouteDeps>(depsOrContext);
  const resolvedDeps = resolveFeedRouteDeps(depsOrContext);
  const feedAttemptContext = buildFeedAttemptContext(request);

  try {
    const user = await resolvedDeps.requireAuth(request);
    if (user instanceof Response) return user;

    const feedUrl = await resolveValidatedFeedUrl(request, resolvedDeps);
    if (feedUrl instanceof Response) return feedUrl;
    return await resolvedDeps.readFeed(user.userId, feedUrl);
  } catch (error) {
    const upstreamResponse = serverApi.respondToFeedReadError({
      error,
      feedAttemptContext,
      isSourceNotFound: resolveRouteDependency(
        deps.isFeedSourceNotFoundErrorFn,
        isFeedSourceNotFoundError,
      ),
      isUpstreamError: resolveRouteDependency(
        deps.isUpstreamFeedErrorFn,
        isUpstreamFeedError,
      ),
      jsonError: resolveRouteDependency(deps.jsonErrorFn, jsonError),
      request,
      requestedFeedUrl: resolvedDeps.requestedFeedUrl,
      toErrorMessage: resolveRouteDependency(
        deps.toErrorMessageFn,
        toErrorMessage,
      ),
      upstreamFeedErrorMessage: UPSTREAM_FEED_ERROR_MESSAGE,
      warn: resolveFeedRouteWarn(deps.warnFn),
    });
    if (upstreamResponse) return upstreamResponse;

    return resolvedDeps.respondError("Error fetching feed", error);
  }
}

/**
 * Render the patch component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered patch component.
 */
export async function PATCH(
  request: NextRequest,
  depsOrContext: FeedRouteDeps | serverApi.RouteHandlerContext = {},
) {
  const deps = serverApi.resolveRouteHandlerDeps<FeedRouteDeps>(depsOrContext);
  const resolvedDeps = resolveFeedRouteDeps(depsOrContext);

  try {
    const mutablePatchUser = await requireMutableFeedUser(
      request,
      resolvedDeps,
    );
    if (mutablePatchUser instanceof Response) return mutablePatchUser;

    const user = mutablePatchUser;
    if (resolvedDeps.parseRenamePayload) {
      const parsedPayload = await resolvedDeps.parseRenamePayload(request);
      if (parsedPayload instanceof Response) return parsedPayload;

      return await renameFeedSourceFromPayload(
        user.userId,
        parsedPayload,
        deps,
        resolvedDeps.assertAllowedUrl,
      );
    }

    const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (payloadOrResponse instanceof Response) return payloadOrResponse;

    return await handlePatchFromParsedJsonPayload(
      user.userId,
      payloadOrResponse,
      deps,
      resolvedDeps,
    );
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError) {
      return toServerServiceErrorResponse(error, deps);
    }

    return resolvedDeps.respondError("Error renaming feed source", error);
  }
}

/**
 * Render the post component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered post component.
 */
export async function POST(
  request: NextRequest,
  depsOrContext: FeedRouteDeps | serverApi.RouteHandlerContext = {},
) {
  const { deps, resolvedDeps, user } = await requireMutableFeedRouteContext(
    request,
    depsOrContext,
    {
      rateLimit: {
        key: "feed-create",
        maxAttempts: CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
        windowMs: CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
      },
    },
  );

  try {
    if (user instanceof Response) return user;

    const parsedPayload = await resolvedDeps.parseCreatePayload(request);
    if (parsedPayload instanceof Response) return parsedPayload;

    const invalidFeedUrlResponse = await resolvedDeps.assertAllowedUrl(
      parsedPayload.url,
    );
    if (invalidFeedUrlResponse) return invalidFeedUrlResponse;

    const result = await createFeed(user.userId, parsedPayload, {
      createOrUpdateFeedSourceFn: deps.createOrUpdateFeedSourceFn,
      getDbFn: deps.getDbFn,
    });

    return NextResponse.json(
      { ...result.sourceRecord, category: parsedPayload.category },
      { status: result.isNew ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError) {
      return toServerServiceErrorResponse(error, deps);
    }

    return resolvedDeps.respondError("Error creating feed source", error);
  }
}

/**
 * Build the feed attempt context.
 * @param request - The request.
 * @returns The feed attempt context.
 */
function buildFeedAttemptContext(request: NextRequest) {
  return {
    feedAttemptId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    requestId:
      request.headers.get("x-request-id") ??
      request.headers.get("x-correlation-id") ??
      null,
    verboseLoggingEnabled: isVerboseLoggingEnabled(),
  };
} /**
 * Process the handle patch from parsed json payload.
 * @param userId - The r id.
 * @param payload - The payload.
 * @param deps - The deps.
 * @param resolvedDeps - The d deps.
 * @returns The handle patch from parsed json payload.
 */
async function handlePatchFromParsedJsonPayload(
  userId: number,
  payload: Record<string, unknown>,
  deps: FeedRouteDeps,
  resolvedDeps: ResolvedFeedRouteDeps,
) {
  if (typeof payload.enabled === "boolean") {
    const parsedTogglePayload =
      resolvedDeps.parseToggleEnabledPayloadFromBody(payload);
    if (parsedTogglePayload instanceof Response) {
      return parsedTogglePayload;
    }

    const updatedSource = await setFeedEnabled(
      userId,
      parsedTogglePayload.sourceId,
      parsedTogglePayload.enabled,
      { setFeedSourceEnabledForUserFn: deps.setFeedSourceEnabledForUserFn },
    );
    return NextResponse.json(updatedSource);
  }

  if (
    typeof payload.extractionDisabled === "boolean" ||
    typeof payload.proxyEnabled === "boolean"
  ) {
    const parsedSettings = resolvedDeps.parseUpdateSettingsFromBody(payload);
    if (parsedSettings instanceof Response) {
      return parsedSettings;
    }

    const updatedSource = await updateFeedSettings(
      userId,
      parsedSettings.sourceId,
      {
        extractionDisabled: parsedSettings.extractionDisabled,
        proxyEnabled: parsedSettings.proxyEnabled,
      },
      { updateFeedSettingsForUserFn: deps.updateFeedSettingsForUserFn },
    );
    return NextResponse.json(updatedSource);
  }

  const parsedPayload = resolvedDeps.parseRenamePayloadFromBody(payload);
  if (parsedPayload instanceof Response) {
    return parsedPayload;
  }

  return renameFeedSourceFromPayload(
    userId,
    parsedPayload,
    deps,
    resolvedDeps.assertAllowedUrl,
  );
}

/**
 * Process the rename feed source from payload.
 * @param userId - The r id.
 * @param parsedPayload - The d payload.
 * @param deps - The deps.
 * @param assertAllowedUrl - The assert allowed url.
 * @returns The rename feed source from payload.
 */
async function renameFeedSourceFromPayload(
  userId: number,
  parsedPayload: RenameFeedSourceFromPayloadParsedPayload,
  deps: FeedRouteDeps,
  assertAllowedUrl: typeof assertAllowedFeedUrl,
) {
  const invalidFeedUrlResponse = await assertAllowedUrl(parsedPayload.url);
  if (invalidFeedUrlResponse) {
    return invalidFeedUrlResponse;
  }

  const updatedSource = await renameFeed(
    userId,
    parsedPayload.sourceId,
    parsedPayload.name,
    parsedPayload.url,
    { renameFeedSourceForUserFn: deps.renameFeedSourceForUserFn },
  );
  return NextResponse.json(updatedSource);
}

/**
 * Process the require mutable feed route context.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @param options - The options used to process the require mutable feed route context.
 * @returns The require mutable feed route context.
 */
async function requireMutableFeedRouteContext(
  request: NextRequest,
  depsOrContext: FeedRouteDeps | serverApi.RouteHandlerContext,
  options?: Parameters<ResolvedFeedRouteDeps["requireMutable"]>[1],
) {
  const deps = serverApi.resolveRouteHandlerDeps<FeedRouteDeps>(depsOrContext);
  const resolvedDeps = resolveFeedRouteDeps(depsOrContext);
  const user = await requireMutableFeedUser(request, resolvedDeps, options);

  return {
    deps,
    resolvedDeps,
    user,
  };
}

/**
 * Process the require mutable feed user.
 * @param request - The request.
 * @param resolvedDeps - The d deps.
 * @param options - The options used to process the require mutable feed user.
 * @returns The require mutable feed user.
 */
async function requireMutableFeedUser(
  request: NextRequest,
  resolvedDeps: ResolvedFeedRouteDeps,
  options?: Parameters<ResolvedFeedRouteDeps["requireMutable"]>[1],
) {
  return resolvedDeps.requireMutable(request, options);
}

/**
 * Resolve the feed route deps.
 * @param depsOrContext - The deps or context.
 * @returns The feed route deps.
 */
function resolveFeedRouteDeps(
  depsOrContext: FeedRouteDeps | serverApi.RouteHandlerContext,
): ResolvedFeedRouteDeps {
  const deps = serverApi.resolveRouteHandlerDeps<FeedRouteDeps>(depsOrContext);

  return {
    assertAllowedUrl: resolveRouteDependency(
      deps.assertAllowedFeedUrlFn,
      assertAllowedFeedUrl,
    ),
    parseCreatePayload: resolveRouteDependency(
      deps.parseCreateFeedPayloadFn,
      parseCreateFeedPayload,
    ),
    parseDeleteId: resolveRouteDependency(
      deps.parseDeleteSourceIdFn,
      parseDeleteSourceId,
    ),
    parseRenamePayload: deps.parseRenameFeedPayloadFn,
    parseRenamePayloadFromBody: resolveRouteDependency(
      deps.parseRenameFeedPayloadFromBodyFn,
      parseRenameFeedPayloadFromBody,
    ),
    parseToggleEnabledPayloadFromBody: resolveRouteDependency(
      deps.parseToggleFeedEnabledPayloadFromBodyFn,
      parseToggleFeedEnabledPayloadFromBody,
    ),
    parseUpdateSettingsFromBody: resolveRouteDependency(
      deps.parseUpdateFeedSettingsPayloadFromBodyFn,
      parseUpdateFeedSettingsPayloadFromBody,
    ),
    readFeed: resolveRouteDependency(deps.handleFeedReadFn, handleFeedRead),
    requestedFeedUrl: resolveRouteDependency(
      deps.getRequestedFeedUrlFn,
      getRequestedFeedUrl,
    ),
    requireAuth: resolveRouteDependency(
      deps.requireAuthenticatedUserFn,
      serverApi.requireAuthenticatedUser,
    ),
    requireMutable: resolveRouteDependency(
      deps.requireMutableFeedAccessFn,
      requireMutableFeedAccess,
    ),
    respondError: resolveRouteDependency(
      deps.logAndRespondErrorFn,
      serverApi.logAndRespondError,
    ),
  };
}

/**
 * Resolve the warn function to use for feed route logging.
 * @param warnFn - Optional override for the logger warn function (used in tests).
 * @returns The resolved warn function bound to the application logger.
 */
function resolveFeedRouteWarn(warnFn?: typeof logger.warn): FeedRouteWarn {
  return (warnFn ?? logger.warn.bind(logger)) as FeedRouteWarn;
}

/**
 * Resolve the route dependency.
 * @param dependency - The dependency.
 * @param fallback - The fallback.
 * @returns The route dependency.
 */
function resolveRouteDependency<T>(dependency: T | undefined, fallback: T): T {
  return dependency ?? fallback;
}

/**
 * Resolve the validated feed url.
 * @param request - The request.
 * @param resolvedDeps - The d deps.
 * @returns The validated feed url.
 */
async function resolveValidatedFeedUrl(
  request: NextRequest,
  resolvedDeps: ResolvedFeedRouteDeps,
): Promise<null | Response | string> {
  const feedUrl = resolvedDeps.requestedFeedUrl(request);
  if (!feedUrl) {
    return null;
  }

  const invalidFeedUrlResponse = await resolvedDeps.assertAllowedUrl(feedUrl);
  return invalidFeedUrlResponse ?? feedUrl;
}

/**
 * Process the to server service error response.
 * @param error - The error.
 * @param deps - The deps.
 * @returns The to server service error response.
 */
function toServerServiceErrorResponse(
  error: serverApi.ServerServiceError,
  deps: FeedRouteDeps,
) {
  return (deps.jsonErrorFn ?? jsonError)(error.message, error.status);
}
