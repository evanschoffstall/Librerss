import { parseJsonBodyOrResponse } from "@/lib/api/request";
import { jsonError } from "@/lib/api/responses";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/api/request-guards";
import {
  isSafePositiveItemId,
  upsertArticleStatuses,
} from "@/lib/core/article-status";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type StatusPayload = {
  articleId: number;
  isRead?: boolean;
  isStarred?: boolean;
};

function parseStatusPayload(
  data: Record<string, unknown>,
): StatusPayload | Response {
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutableAuthenticatedUser(request);
    if (user instanceof Response) return user;

    const body =
      await parseJsonBodyOrResponse<Record<string, unknown>>(request);
    if (body instanceof Response) return body;

    const payload = parseStatusPayload(body);
    if (payload instanceof Response) return payload;

    await upsertArticleStatuses(user.userId, [payload.articleId], {
      isRead: payload.isRead,
      isStarred: payload.isStarred,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return logAndRespondError("Article status update error", error);
  }
}
