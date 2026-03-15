import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { getUserOwnedArticleById } from "@/lib/core/article-records";
import { upsertArticleStatuses } from "@/lib/core/article-status";
import { invalidateUserCache } from "@/lib/core/feed-cache";
import { getDb } from "@/lib/db/db";
import {
  type AuthenticatedUser,
  logAndRespondError,
  requireMutableUserAndJsonBody,
} from "@/lib/server";
import { isSafePositiveItemId } from "@/lib/utils/validation";

export const dynamic = "force-dynamic";

interface StatusPayload {
  articleId: number;
  isRead?: boolean;
  isStarred?: boolean;
}

/** Dep-injection seam for unit tests. */
interface StatusPostDeps {
  getUserOwnedArticleByIdFn?: typeof getUserOwnedArticleById;
  /** Concrete (non-generic) overload used by tests to stub auth + body parsing. */
  requireMutableUserAndJsonBodyFn?: (
    request: NextRequest,
  ) => Promise<
    Response | { body: Record<string, unknown>; user: AuthenticatedUser }
  >;
  upsertArticleStatusesFn?: typeof upsertArticleStatuses;
}

export async function POST(request: NextRequest, deps?: StatusPostDeps) {
  const requireAuth =
    deps?.requireMutableUserAndJsonBodyFn ?? requireMutableUserAndJsonBody;
  const getOwnedArticle =
    deps?.getUserOwnedArticleByIdFn ?? getUserOwnedArticleById;
  const upsertStatuses = deps?.upsertArticleStatusesFn ?? upsertArticleStatuses;

  try {
    const authAndBody = await requireAuth(request);
    if (authAndBody instanceof Response) return authAndBody;

    const { body, user } = authAndBody;

    const payload = parseStatusPayload(body);
    if (payload instanceof Response) return payload;

    // Verify the article exists in a feed the user subscribes to. This
    // prevents both FK-violation 500s on invalid IDs and silent cross-user
    // status insertion on IDs from unsubscribed feeds.
    const db = getDb();
    const article = await getOwnedArticle(db, user.userId, payload.articleId);
    if (!article) return jsonError("Article not found", 404);

    await upsertStatuses(user.userId, [payload.articleId], {
      isRead: payload.isRead,
      isStarred: payload.isStarred,
    });

    invalidateUserCache(user.userId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return logAndRespondError("Article status update error", error);
  }
}

function parseStatusPayload(
  data: Record<string, unknown>,
): Response | StatusPayload {
  const articleId = data.articleId;
  if (!isSafePositiveItemId(articleId)) {
    return jsonError("articleId must be a positive integer", 400);
  }

  const isRead = typeof data.isRead === "boolean" ? data.isRead : undefined;
  const isStarred =
    typeof data.isStarred === "boolean" ? data.isStarred : undefined;

  if (isRead === undefined && isStarred === undefined) {
    return jsonError("At least one of isRead or isStarred is required", 400);
  }

  return { articleId, isRead, isStarred };
}
