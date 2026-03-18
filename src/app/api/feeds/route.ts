import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { requireMutableFeedAccess } from "@/lib/api/feeds/access";
import {
  assertAllowedFeedUrl,
  getRequestedFeedUrl,
  parseCreateFeedPayload,
  parseDeleteSourceId,
  parseRenameFeedPayloadFromBody,
  parseToggleFeedEnabledPayloadFromBody,
  parseUpdateFeedSettingsPayloadFromBody,
} from "@/lib/api/feeds/parsers";
import { handleFeedRead } from "@/lib/api/feeds/read";
import {
  createOrUpdateFeedSource,
  deleteFeedSourceForUser,
  renameFeedSourceForUser,
  setFeedSourceEnabledForUser,
  updateFeedSettingsForUser,
} from "@/lib/api/feeds/repository";
import {
  buildAxiosFailureDiagnostics,
  isVerboseLoggingEnabled,
  jsonError,
  parseJsonObjectBodyOrResponse,
} from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import {
  isFeedSourceNotFoundError,
  isUpstreamFeedError,
} from "@/lib/core/feed-fetcher";
import { getDb } from "@/lib/db/db";
import { logger } from "@/lib/logger";
import { logAndRespondError, requireAuthenticatedUser } from "@/lib/server";
import {
  createFeed,
  deleteFeed,
  renameFeed,
  ServiceError,
  setFeedEnabled,
  updateFeedSettings,
} from "@/lib/server/services";
import { toErrorMessage } from "@/lib/utils/errors";
import { redactUrlForLogs } from "@/lib/utils/url";

export const dynamic = "force-dynamic";

const UPSTREAM_FEED_ERROR_MESSAGE = "Failed to fetch feed from upstream";

// ─── Dependency injection types (for testability) ─────────────────────────────

interface FeedRouteDeps {
  assertAllowedFeedUrlFn?: typeof assertAllowedFeedUrl;
  createOrUpdateFeedSourceFn?: typeof createOrUpdateFeedSource;
  deleteFeedSourceForUserFn?: typeof deleteFeedSourceForUser;
  getDbFn?: typeof getDb;
  getRequestedFeedUrlFn?: typeof getRequestedFeedUrl;
  handleFeedReadFn?: typeof handleFeedRead;
  isAxiosErrorFn?: typeof axios.isAxiosError;
  isFeedSourceNotFoundErrorFn?: typeof isFeedSourceNotFoundError;
  isUpstreamFeedErrorFn?: typeof isUpstreamFeedError;
  jsonErrorFn?: typeof jsonError;
  logAndRespondErrorFn?: typeof logAndRespondError;
  parseCreateFeedPayloadFn?: typeof parseCreateFeedPayload;
  parseDeleteSourceIdFn?: typeof parseDeleteSourceId;
  parseRenameFeedPayloadFn?: (
    request: NextRequest,
  ) => Promise<Response | { name: string; sourceId: number; url: string }>;
  parseRenameFeedPayloadFromBodyFn?: typeof parseRenameFeedPayloadFromBody;
  parseToggleFeedEnabledPayloadFromBodyFn?: typeof parseToggleFeedEnabledPayloadFromBody;
  parseUpdateFeedSettingsPayloadFromBodyFn?: typeof parseUpdateFeedSettingsPayloadFromBody;
  renameFeedSourceForUserFn?: typeof renameFeedSourceForUser;
  requireAuthenticatedUserFn?: typeof requireAuthenticatedUser;
  requireMutableFeedAccessFn?: typeof requireMutableFeedAccess;
  setFeedSourceEnabledForUserFn?: typeof setFeedSourceEnabledForUser;
  toErrorMessageFn?: typeof toErrorMessage;
  updateFeedSettingsForUserFn?: typeof updateFeedSettingsForUser;
  warnFn?: typeof logger.warn;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, deps: FeedRouteDeps = {}) {
  const requireMutable =
    deps.requireMutableFeedAccessFn ?? requireMutableFeedAccess;
  const parseDeleteId = deps.parseDeleteSourceIdFn ?? parseDeleteSourceId;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request);
    if (user instanceof Response) return user;

    const sourceId = parseDeleteId(request);
    if (sourceId instanceof Response) return sourceId;

    const deletedSource = await deleteFeed(user.userId, sourceId, {
      deleteFeedSourceForUserFn: deps.deleteFeedSourceForUserFn,
    });
    return NextResponse.json(deletedSource);
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return respondError("Error deleting feed source", error);
  }
}

export async function GET(request: NextRequest, deps: FeedRouteDeps = {}) {
  const requireAuth =
    deps.requireAuthenticatedUserFn ?? requireAuthenticatedUser;
  const requestedFeedUrl = deps.getRequestedFeedUrlFn ?? getRequestedFeedUrl;
  const assertAllowedUrl = deps.assertAllowedFeedUrlFn ?? assertAllowedFeedUrl;
  const readFeed = deps.handleFeedReadFn ?? handleFeedRead;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;
  const verboseLoggingEnabled = isVerboseLoggingEnabled();
  const feedAttemptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const requestId =
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    null;

  try {
    const user = await requireAuth(request);
    if (user instanceof Response) return user;

    const feedUrl = requestedFeedUrl(request);

    if (feedUrl) {
      const invalidFeedUrlResponse = await assertAllowedUrl(feedUrl);
      if (invalidFeedUrlResponse) return invalidFeedUrlResponse;
    }

    return await readFeed(user.userId, feedUrl);
  } catch (error) {
    const requestedUrl = requestedFeedUrl(request);
    const safeUrl = requestedUrl ? redactUrlForLogs(requestedUrl) : null;

    const upstreamResponse = handleUpstreamFeedError(error, safeUrl, deps, {
      feedAttemptId,
      requestId,
      verboseLoggingEnabled,
    });
    if (upstreamResponse) return upstreamResponse;

    return respondError("Error fetching feed", error);
  }
}

export async function PATCH(request: NextRequest, deps: FeedRouteDeps = {}) {
  const requireMutable =
    deps.requireMutableFeedAccessFn ?? requireMutableFeedAccess;
  const parseRenamePayloadFromBody =
    deps.parseRenameFeedPayloadFromBodyFn ?? parseRenameFeedPayloadFromBody;
  const parseRenamePayload = deps.parseRenameFeedPayloadFn;
  const parseToggleEnabledPayloadFromBody =
    deps.parseToggleFeedEnabledPayloadFromBodyFn ??
    parseToggleFeedEnabledPayloadFromBody;
  const parseUpdateSettingsFromBody =
    deps.parseUpdateFeedSettingsPayloadFromBodyFn ??
    parseUpdateFeedSettingsPayloadFromBody;
  const assertAllowedUrl = deps.assertAllowedFeedUrlFn ?? assertAllowedFeedUrl;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request);
    if (user instanceof Response) return user;

    if (parseRenamePayload) {
      const parsedPayload = await parseRenamePayload(request);
      if (parsedPayload instanceof Response) return parsedPayload;

      const invalidFeedUrlResponse = await assertAllowedUrl(parsedPayload.url);
      if (invalidFeedUrlResponse) return invalidFeedUrlResponse;

      const updatedSource = await renameFeed(
        user.userId, parsedPayload.sourceId, parsedPayload.name, parsedPayload.url,
        { renameFeedSourceForUserFn: deps.renameFeedSourceForUserFn },
      );
      return NextResponse.json(updatedSource);
    }

    const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (payloadOrResponse instanceof Response) return payloadOrResponse;

    const payload = payloadOrResponse;

    if (typeof payload.enabled === "boolean") {
      const parsedTogglePayload = parseToggleEnabledPayloadFromBody(payload);
      if (parsedTogglePayload instanceof Response) return parsedTogglePayload;

      const updatedSource = await setFeedEnabled(
        user.userId, parsedTogglePayload.sourceId, parsedTogglePayload.enabled,
        { setFeedSourceEnabledForUserFn: deps.setFeedSourceEnabledForUserFn },
      );
      return NextResponse.json(updatedSource);
    }

    if (
      typeof payload.extractionDisabled === "boolean" ||
      typeof payload.proxyEnabled === "boolean"
    ) {
      const parsedSettings = parseUpdateSettingsFromBody(payload);
      if (parsedSettings instanceof Response) return parsedSettings;

      const updatedSource = await updateFeedSettings(
        user.userId, parsedSettings.sourceId, {
          extractionDisabled: parsedSettings.extractionDisabled,
          proxyEnabled: parsedSettings.proxyEnabled,
        },
        { updateFeedSettingsForUserFn: deps.updateFeedSettingsForUserFn },
      );
      return NextResponse.json(updatedSource);
    }

    const parsedPayload = parseRenamePayloadFromBody(payload);
    if (parsedPayload instanceof Response) return parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedUrl(parsedPayload.url);
    if (invalidFeedUrlResponse) return invalidFeedUrlResponse;

    const updatedSource = await renameFeed(
      user.userId, parsedPayload.sourceId, parsedPayload.name, parsedPayload.url,
      { renameFeedSourceForUserFn: deps.renameFeedSourceForUserFn },
    );
    return NextResponse.json(updatedSource);
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return respondError("Error renaming feed source", error);
  }
}

export async function POST(request: NextRequest, deps: FeedRouteDeps = {}) {
  const requireMutable =
    deps.requireMutableFeedAccessFn ?? requireMutableFeedAccess;
  const parseCreatePayload =
    deps.parseCreateFeedPayloadFn ?? parseCreateFeedPayload;
  const assertAllowedUrl = deps.assertAllowedFeedUrlFn ?? assertAllowedFeedUrl;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request, {
      rateLimit: {
        key: "feed-create",
        maxAttempts: CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
        windowMs: CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
      },
    });
    if (user instanceof Response) return user;

    const parsedPayload = await parseCreatePayload(request);
    if (parsedPayload instanceof Response) return parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedUrl(parsedPayload.url);
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
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return respondError("Error creating feed source", error);
  }
}

function handleUpstreamFeedError(
  error: unknown,
  safeUrl: null | string,
  deps: FeedRouteDeps,
  context?: {
    feedAttemptId?: string;
    requestId?: null | string;
    verboseLoggingEnabled?: boolean;
  },
): null | Response {
  const isSourceNotFound =
    deps.isFeedSourceNotFoundErrorFn ?? isFeedSourceNotFoundError;
  const isUpstreamError = deps.isUpstreamFeedErrorFn ?? isUpstreamFeedError;
  const isAxiosError = deps.isAxiosErrorFn ?? axios.isAxiosError;
  const toMessage = deps.toErrorMessageFn ?? toErrorMessage;
  const toJsonError = deps.jsonErrorFn ?? jsonError;
  const warn = deps.warnFn ?? logger.warn.bind(logger);
  const urlSuffix = safeUrl ? ` for ${safeUrl}` : "";
  const verboseLoggingEnabled = context?.verboseLoggingEnabled ?? false;
  const feedAttemptId = context?.feedAttemptId;
  const requestId = context?.requestId ?? null;

  if (isSourceNotFound(error)) {
    return toJsonError("Feed source not found", 404);
  }

  if (isUpstreamError(error)) {
    warn(
      `Returning 502 Bad Gateway — upstream feed fetch failed${urlSuffix}: ${toMessage(error)}`,
      {
        feedAttemptId,
        requestId,
        url: safeUrl,
      },
    );
    return toJsonError(UPSTREAM_FEED_ERROR_MESSAGE, 502);
  }

  if (isAxiosError(error)) {
    const status = 502;
    const label = "Bad Gateway";
    warn(
      `Returning ${status} ${label} — upstream feed request failed${urlSuffix}: ${toMessage(error)}`,
      {
        feedAttemptId,
        requestId,
        url: safeUrl,
        ...(verboseLoggingEnabled
          ? buildAxiosFailureDiagnostics(error, isAxiosError)
          : {}),
      },
    );
    return toJsonError(UPSTREAM_FEED_ERROR_MESSAGE, status);
  }

  return null;
}
