import { jsonError } from "@/lib/api/responses";
import {
  logAndRespondError,
  requireAuthenticatedUser,
} from "@/lib/api/route-helpers";
import { CONFIG } from "@/lib/config";
import { getDb } from "@/lib/db/db";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import { requireMutableFeedAccess } from "./feed-access";
import { handleFeedRead, isFeedSourceNotFoundError } from "./feed-get";
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

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof Response) {
      return user;
    }

    const feedUrl = getRequestedFeedUrl(request);

    if (feedUrl) {
      const invalidFeedUrlResponse = await assertAllowedFeedUrl(feedUrl);
      if (invalidFeedUrlResponse) {
        return invalidFeedUrlResponse;
      }
    }

    return handleFeedRead(user.userId, feedUrl);
  } catch (error) {
    if (isFeedSourceNotFoundError(error)) {
      return jsonError("Feed source not found", 404);
    }

    if (axios.isAxiosError(error)) {
      return logAndRespondError("Error fetching feed", error, {
        status: 502,
        publicMessage: "Unable to fetch upstream feed",
      });
    }

    return logAndRespondError("Error fetching feed", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutableFeedAccess(request, {
      rateLimit: {
        key: "feed-create",
        windowMs: CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
      },
    });
    if (user instanceof Response) {
      return user;
    }

    const parsedPayload = await parseCreateFeedPayload(request);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }

    const payload = parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedFeedUrl(payload.url);
    if (invalidFeedUrlResponse) {
      return invalidFeedUrlResponse;
    }

    const db = getDb();

    const { sourceRecord, isNew } = await db.transaction(async (tx) => {
      return createOrUpdateFeedSource(tx, user.userId, payload);
    });

    return NextResponse.json(
      { ...sourceRecord, category: payload.category },
      { status: isNew ? 201 : 200 },
    );
  } catch (error) {
    return logAndRespondError("Error creating feed source", error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireMutableFeedAccess(request);
    if (user instanceof Response) {
      return user;
    }

    const parsedPayload = await parseRenameFeedPayload(request);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }

    const { sourceId, name, url } = parsedPayload;

    const invalidFeedUrlResponse = await assertAllowedFeedUrl(url);
    if (invalidFeedUrlResponse) {
      return invalidFeedUrlResponse;
    }

    const updatedSource = await renameFeedSourceForUser(
      user.userId,
      sourceId,
      name,
      url,
    );

    if (!updatedSource) {
      return jsonError("Feed source not found", 404);
    }

    return NextResponse.json(updatedSource);
  } catch (error) {
    return logAndRespondError("Error renaming feed source", error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireMutableFeedAccess(request);
    if (user instanceof Response) {
      return user;
    }

    const sourceId = parseDeleteSourceId(request);
    if (sourceId instanceof Response) {
      return sourceId;
    }

    const deletedSource = await deleteFeedSourceForUser(user.userId, sourceId);

    if (!deletedSource) {
      // Row was deleted by a concurrent request; treat as already gone.
      return jsonError("Feed source not found", 404);
    }

    return NextResponse.json(deletedSource);
  } catch (error) {
    return logAndRespondError("Error deleting feed source", error);
  }
}
