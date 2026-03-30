import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http";
import { getUserOwnedArticleById } from "@/lib/core/article-records";
import { upsertArticleStatuses } from "@/lib/core/article-status";
import {
  type AuthenticatedUser,
  logAndRespondError,
  requireMutableUserAndJsonBody,
  resolveRouteHandlerDeps,
  type RouteHandlerContext, ServerServiceError, updateArticleStatus } from "@/lib/server";
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
  requireMutableUserAndJsonBodyFn?: (
    request: NextRequest,
  ) => Promise<
    Response | { body: Record<string, unknown>; user: AuthenticatedUser }
  >;
  upsertArticleStatusesFn?: typeof upsertArticleStatuses;
}

export async function POST(
  request: NextRequest,
  depsOrContext: RouteHandlerContext | StatusPostDeps = {},
) {
  const deps = resolveRouteHandlerDeps<StatusPostDeps>(depsOrContext);
  const requireAuth =
    deps.requireMutableUserAndJsonBodyFn ?? requireMutableUserAndJsonBody;

  try {
    const authAndBody = await requireAuth(request);
    if (authAndBody instanceof Response) return authAndBody;

    const { body, user } = authAndBody;
    const payload = parseStatusPayload(body);
    if (payload instanceof Response) return payload;

    await updateArticleStatus(user.userId, payload.articleId, {
      isRead: payload.isRead,
      isStarred: payload.isStarred,
    }, {
      getUserOwnedArticleByIdFn: deps.getUserOwnedArticleByIdFn,
      upsertArticleStatusesFn: deps.upsertArticleStatusesFn,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ServerServiceError) return jsonError(error.message, error.status);
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
