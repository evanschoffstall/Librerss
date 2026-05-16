import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import type {
  getUserOwnedArticleById,
  upsertArticleStatuses,
} from "@/lib/core/server";

import { jsonError } from "@/lib/api/http";
import { serverApi, updateArticleStatus } from "@/lib/server";
import { isSafePositiveItemId } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Describes the status payload.
 */
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
    | Response
    | { body: Record<string, unknown>; user: serverApi.AuthenticatedUser }
  >;
  upsertArticleStatusesFn?: typeof upsertArticleStatuses;
}

/**
 * Handle the POST request.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns A JSON response or error response.
 */
export async function POST(
  request: NextRequest,
  depsOrContext: serverApi.RouteHandlerContext | StatusPostDeps = {},
) {
  const deps = serverApi.resolveRouteHandlerDeps<StatusPostDeps>(depsOrContext);
  const requireAuth =
    deps.requireMutableUserAndJsonBodyFn ??
    serverApi.requireMutableUserAndJsonBody;

  try {
    const authAndBody = await requireAuth(request);
    if (authAndBody instanceof Response) return authAndBody;

    const { body, user } = authAndBody;
    const payload = parseStatusPayload(body);
    if (payload instanceof Response) return payload;

    await updateArticleStatus(
      user.userId,
      payload.articleId,
      {
        isRead: payload.isRead,
        isStarred: payload.isStarred,
      },
      {
        getUserOwnedArticleByIdFn: deps.getUserOwnedArticleByIdFn,
        upsertArticleStatusesFn: deps.upsertArticleStatusesFn,
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError)
      return jsonError(error.message, error.status);
    return serverApi.logAndRespondError("Article status update error", error);
  }
}

/**
 * Parse the status payload.
 * @param data - The data.
 * @returns The status payload.
 */
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
