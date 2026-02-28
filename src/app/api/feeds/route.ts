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
import { toErrorMessage } from "@/lib/utils/errors";
import { redactUrlForLogs } from "@/lib/utils/url";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import { requireMutableFeedAccess } from "./services/access";
import {
  assertAllowedFeedUrl,
  getRequestedFeedUrl,
  parseCreateFeedPayload,
  parseDeleteSourceId,
  parseRenameFeedPayloadFromBody,
  parseToggleFeedEnabledPayloadFromBody,
} from "./services/parsers";
import { handleFeedRead } from "./services/read";
import {
  createOrUpdateFeedSource,
  deleteFeedSourceForUser,
  renameFeedSourceForUser,
  setFeedSourceEnabledForUser,
} from "./services/repository";

export const dynamic = "force-dynamic";

const UPSTREAM_FEED_ERROR_MESSAGE = "Failed to fetch feed from upstream";
const UPSTREAM_REQUEST_ERROR_MESSAGE = "Upstream request failed";

// ─── Dependency injection types (for testability) ─────────────────────────────

type FeedRouteDeps = {
  requireAuthenticatedUserFn?: typeof requireAuthenticatedUser;
  requireMutableFeedAccessFn?: typeof requireMutableFeedAccess;
  getRequestedFeedUrlFn?: typeof getRequestedFeedUrl;
  assertAllowedFeedUrlFn?: typeof assertAllowedFeedUrl;
  handleFeedReadFn?: typeof handleFeedRead;
  isFeedSourceNotFoundErrorFn?: typeof isFeedSourceNotFoundError;
  isUpstreamFeedErrorFn?: typeof isUpstreamFeedError;
  isAxiosErrorFn?: typeof axios.isAxiosError;
  toErrorMessageFn?: typeof toErrorMessage;
  logAndRespondErrorFn?: typeof logAndRespondError;
  jsonErrorFn?: typeof jsonError;
  warnFn?: typeof logger.warn;
  parseCreateFeedPayloadFn?: typeof parseCreateFeedPayload;
  getDbFn?: typeof getDb;
  createOrUpdateFeedSourceFn?: typeof createOrUpdateFeedSource;
  parseRenameFeedPayloadFn?: (
    request: NextRequest,
  ) => Promise<{ sourceId: number; name: string; url: string } | Response>;
  parseRenameFeedPayloadFromBodyFn?: typeof parseRenameFeedPayloadFromBody;
  parseToggleFeedEnabledPayloadFromBodyFn?: typeof parseToggleFeedEnabledPayloadFromBody;
  renameFeedSourceForUserFn?: typeof renameFeedSourceForUser;
  setFeedSourceEnabledForUserFn?: typeof setFeedSourceEnabledForUser;
  parseDeleteSourceIdFn?: typeof parseDeleteSourceId;
  deleteFeedSourceForUserFn?: typeof deleteFeedSourceForUser;
};

// ─── Shared upstream error handler ────────────────────────────────────────────

function handleUpstreamFeedError(
  error: unknown,
  safeUrl: string | null,
  deps: FeedRouteDeps,
  context?: {
    verboseLoggingEnabled?: boolean;
    feedAttemptId?: string;
    requestId?: string | null;
  },
): Response | null {
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
        url: safeUrl,
        feedAttemptId,
        requestId,
      },
    );
    return toJsonError(UPSTREAM_FEED_ERROR_MESSAGE, 502);
  }

  if (isAxiosError(error)) {
    const upstreamStatus = error.response?.status;
    const status =
      typeof upstreamStatus === "number" && upstreamStatus >= 400
        ? upstreamStatus
        : 502;
    const label = status === 502 ? "Bad Gateway" : "Upstream Error";
    warn(
      `Returning ${status} ${label} — upstream feed request failed${urlSuffix}: ${toMessage(error)}`,
      {
        url: safeUrl,
        feedAttemptId,
        requestId,
        ...(verboseLoggingEnabled
          ? buildAxiosFailureDiagnostics(error, isAxiosError)
          : {}),
      },
    );
    return toJsonError(
      status === 502
        ? UPSTREAM_FEED_ERROR_MESSAGE
        : UPSTREAM_REQUEST_ERROR_MESSAGE,
      status,
    );
  }

  return null;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

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
      verboseLoggingEnabled,
      feedAttemptId,
      requestId,
    });
    if (upstreamResponse) return upstreamResponse;

    return respondError("Error fetching feed", error);
  }
}

export async function POST(request: NextRequest, deps: FeedRouteDeps = {}) {
  const requireMutable =
    deps.requireMutableFeedAccessFn ?? requireMutableFeedAccess;
  const parseCreatePayload =
    deps.parseCreateFeedPayloadFn ?? parseCreateFeedPayload;
  const assertAllowedUrl = deps.assertAllowedFeedUrlFn ?? assertAllowedFeedUrl;
  const getDbForRoute = deps.getDbFn ?? getDb;
  const createOrUpdate =
    deps.createOrUpdateFeedSourceFn ?? createOrUpdateFeedSource;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request, {
      rateLimit: {
        key: "feed-create",
        windowMs: CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
      },
    });
    if (user instanceof Response) return user;

    const parsedPayload = await parseCreatePayload(request);
    if (parsedPayload instanceof Response) return parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedUrl(parsedPayload.url);
    if (invalidFeedUrlResponse) return invalidFeedUrlResponse;

    const db = getDbForRoute();
    const { sourceRecord, isNew } = await db.transaction((tx) =>
      createOrUpdate(tx, user.userId, parsedPayload),
    );

    return NextResponse.json(
      { ...sourceRecord, category: parsedPayload.category },
      { status: isNew ? 201 : 200 },
    );
  } catch (error) {
    return respondError("Error creating feed source", error);
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
  const assertAllowedUrl = deps.assertAllowedFeedUrlFn ?? assertAllowedFeedUrl;
  const renameSource =
    deps.renameFeedSourceForUserFn ?? renameFeedSourceForUser;
  const setSourceEnabled =
    deps.setFeedSourceEnabledForUserFn ?? setFeedSourceEnabledForUser;
  const toJsonError = deps.jsonErrorFn ?? jsonError;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request);
    if (user instanceof Response) return user;

    if (parseRenamePayload) {
      const parsedPayload = await parseRenamePayload(request);
      if (parsedPayload instanceof Response) return parsedPayload;

      const { sourceId, name, url } = parsedPayload;

      const invalidFeedUrlResponse = await assertAllowedUrl(url);
      if (invalidFeedUrlResponse) return invalidFeedUrlResponse;

      const updatedSource = await renameSource(
        user.userId,
        sourceId,
        name,
        url,
      );
      if (!updatedSource) return toJsonError("Feed source not found", 404);

      return NextResponse.json(updatedSource);
    }

    const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (payloadOrResponse instanceof Response) return payloadOrResponse;

    const payload = payloadOrResponse;

    if (typeof payload.enabled === "boolean") {
      const parsedTogglePayload = parseToggleEnabledPayloadFromBody(payload);
      if (parsedTogglePayload instanceof Response) return parsedTogglePayload;

      const updatedSource = await setSourceEnabled(
        user.userId,
        parsedTogglePayload.sourceId,
        parsedTogglePayload.enabled,
      );
      if (!updatedSource) return toJsonError("Feed source not found", 404);

      return NextResponse.json(updatedSource);
    }

    const parsedPayload = parseRenamePayloadFromBody(payload);
    if (parsedPayload instanceof Response) return parsedPayload;

    const { sourceId, name, url } = parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedUrl(url);
    if (invalidFeedUrlResponse) return invalidFeedUrlResponse;

    const updatedSource = await renameSource(user.userId, sourceId, name, url);
    if (!updatedSource) return toJsonError("Feed source not found", 404);

    return NextResponse.json(updatedSource);
  } catch (error) {
    return respondError("Error renaming feed source", error);
  }
}

export async function DELETE(request: NextRequest, deps: FeedRouteDeps = {}) {
  const requireMutable =
    deps.requireMutableFeedAccessFn ?? requireMutableFeedAccess;
  const parseDeleteId = deps.parseDeleteSourceIdFn ?? parseDeleteSourceId;
  const deleteSource =
    deps.deleteFeedSourceForUserFn ?? deleteFeedSourceForUser;
  const toJsonError = deps.jsonErrorFn ?? jsonError;
  const respondError = deps.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request);
    if (user instanceof Response) return user;

    const sourceId = parseDeleteId(request);
    if (sourceId instanceof Response) return sourceId;

    const deletedSource = await deleteSource(user.userId, sourceId);

    if (!deletedSource) {
      // Row was deleted by a concurrent request; treat as already gone.
      return toJsonError("Feed source not found", 404);
    }

    return NextResponse.json(deletedSource);
  } catch (error) {
    return respondError("Error deleting feed source", error);
  }
}
