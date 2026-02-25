import { jsonError } from "@/lib/api/responses";
import {
  logAndRespondError,
  requireAuthenticatedUser,
} from "@/lib/api/route-helpers";
import { CONFIG } from "@/lib/config";
import {
  isFeedSourceNotFoundError,
  isUpstreamFeedError,
} from "@/lib/core/feed-fetcher";
import { getDb } from "@/lib/db/db";
import { toErrorMessage } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import { requireMutableFeedAccess } from "./feed-access";
import { handleFeedRead } from "./feed-get";
import {
  assertAllowedFeedUrl,
  getRequestedFeedUrl,
  parseCreateFeedPayload,
  parseDeleteSourceId,
  parseRenameFeedPayload,
} from "./feed-parsers";
import {
  createOrUpdateFeedSource,
  deleteFeedSourceForUser,
  renameFeedSourceForUser,
} from "./feed-repository";

export const dynamic = "force-dynamic";

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
  parseRenameFeedPayloadFn?: typeof parseRenameFeedPayload;
  renameFeedSourceForUserFn?: typeof renameFeedSourceForUser;
  parseDeleteSourceIdFn?: typeof parseDeleteSourceId;
  deleteFeedSourceForUserFn?: typeof deleteFeedSourceForUser;
};

export async function GET(request: NextRequest, deps?: FeedRouteDeps) {
  const requireAuth = deps?.requireAuthenticatedUserFn ?? requireAuthenticatedUser;
  const requestedFeedUrl = deps?.getRequestedFeedUrlFn ?? getRequestedFeedUrl;
  const assertAllowedUrl = deps?.assertAllowedFeedUrlFn ?? assertAllowedFeedUrl;
  const readFeed = deps?.handleFeedReadFn ?? handleFeedRead;
  const isSourceNotFound =
    deps?.isFeedSourceNotFoundErrorFn ?? isFeedSourceNotFoundError;
  const isUpstreamError = deps?.isUpstreamFeedErrorFn ?? isUpstreamFeedError;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;
  const toMessage = deps?.toErrorMessageFn ?? toErrorMessage;
  const respondError = deps?.logAndRespondErrorFn ?? logAndRespondError;
  const toJsonError = deps?.jsonErrorFn ?? jsonError;
  const warn = deps?.warnFn ?? logger.warn;

  try {
    const user = await requireAuth(request);
    if (user instanceof Response) {
      return user;
    }

    const feedUrl = requestedFeedUrl(request);

    if (feedUrl) {
      const invalidFeedUrlResponse = await assertAllowedUrl(feedUrl);
      if (invalidFeedUrlResponse) {
        return invalidFeedUrlResponse;
      }
    }

    return await readFeed(user.userId, feedUrl);
  } catch (error) {
    const requestedUrl = requestedFeedUrl(request);

    if (isSourceNotFound(error)) {
      return toJsonError("Feed source not found", 404);
    }

    if (isUpstreamError(error)) {
      const detail = toMessage(error);
      warn(
        `Returning 502 Bad Gateway — upstream feed fetch failed${requestedUrl ? ` for ${requestedUrl}` : ""}: ${detail}`,
      );
      return toJsonError(detail, 502);
    }

    if (isAxiosError(error)) {
      const upstreamStatus = error.response?.status;
      const detail = toMessage(error);
      const status =
        typeof upstreamStatus === "number" && upstreamStatus >= 400
          ? upstreamStatus
          : 502;

      warn(
        `Returning ${status} ${status === 502 ? "Bad Gateway" : "Upstream Error"} — upstream feed request failed${requestedUrl ? ` for ${requestedUrl}` : ""}: ${detail}`,
      );

      return toJsonError(detail, status);
    }

    return respondError("Error fetching feed", error);
  }
}

export async function POST(request: NextRequest, deps?: FeedRouteDeps) {
  const requireMutable = deps?.requireMutableFeedAccessFn ?? requireMutableFeedAccess;
  const parseCreatePayload =
    deps?.parseCreateFeedPayloadFn ?? parseCreateFeedPayload;
  const assertAllowedUrl = deps?.assertAllowedFeedUrlFn ?? assertAllowedFeedUrl;
  const getDbForRoute = deps?.getDbFn ?? getDb;
  const createOrUpdate =
    deps?.createOrUpdateFeedSourceFn ?? createOrUpdateFeedSource;
  const respondError = deps?.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request, {
      rateLimit: {
        key: "feed-create",
        windowMs: CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
      },
    });
    if (user instanceof Response) {
      return user;
    }

    const parsedPayload = await parseCreatePayload(request);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }

    const payload = parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedUrl(payload.url);
    if (invalidFeedUrlResponse) {
      return invalidFeedUrlResponse;
    }

    const db = getDbForRoute();

    const { sourceRecord, isNew } = await db.transaction(async (tx) => {
      return createOrUpdate(tx, user.userId, payload);
    });

    return NextResponse.json(
      { ...sourceRecord, category: payload.category },
      { status: isNew ? 201 : 200 },
    );
  } catch (error) {
    return respondError("Error creating feed source", error);
  }
}

export async function PATCH(request: NextRequest, deps?: FeedRouteDeps) {
  const requireMutable = deps?.requireMutableFeedAccessFn ?? requireMutableFeedAccess;
  const parseRenamePayload =
    deps?.parseRenameFeedPayloadFn ?? parseRenameFeedPayload;
  const assertAllowedUrl = deps?.assertAllowedFeedUrlFn ?? assertAllowedFeedUrl;
  const renameSource =
    deps?.renameFeedSourceForUserFn ?? renameFeedSourceForUser;
  const toJsonError = deps?.jsonErrorFn ?? jsonError;
  const respondError = deps?.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request);
    if (user instanceof Response) {
      return user;
    }

    const parsedPayload = await parseRenamePayload(request);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }

    const { sourceId, name, url } = parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedUrl(url);
    if (invalidFeedUrlResponse) {
      return invalidFeedUrlResponse;
    }

    const updatedSource = await renameSource(
      user.userId,
      sourceId,
      name,
      url,
    );

    if (!updatedSource) {
      return toJsonError("Feed source not found", 404);
    }

    return NextResponse.json(updatedSource);
  } catch (error) {
    return respondError("Error renaming feed source", error);
  }
}

export async function DELETE(request: NextRequest, deps?: FeedRouteDeps) {
  const requireMutable = deps?.requireMutableFeedAccessFn ?? requireMutableFeedAccess;
  const parseDeleteId = deps?.parseDeleteSourceIdFn ?? parseDeleteSourceId;
  const deleteSource = deps?.deleteFeedSourceForUserFn ?? deleteFeedSourceForUser;
  const toJsonError = deps?.jsonErrorFn ?? jsonError;
  const respondError = deps?.logAndRespondErrorFn ?? logAndRespondError;

  try {
    const user = await requireMutable(request);
    if (user instanceof Response) {
      return user;
    }

    const sourceId = parseDeleteId(request);
    if (sourceId instanceof Response) {
      return sourceId;
    }

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
