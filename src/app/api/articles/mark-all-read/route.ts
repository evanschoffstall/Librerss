import { asTrimmedString, jsonError } from "@/lib/api/http";
import { invalidateUserCache } from "@/lib/core/feed-cache";
import { markStreamAsRead } from "@/lib/core/mark-stream-read";
import {
  logAndRespondError,
  requireMutableUserAndJsonBody,
} from "@/lib/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const parsedRequest =
      await requireMutableUserAndJsonBody<Record<string, unknown>>(request);
    if (parsedRequest instanceof Response) {
      return parsedRequest;
    }

    const streamId = asTrimmedString(parsedRequest.body.streamId);
    if (!streamId) {
      return jsonError("streamId is required", 400);
    }

    await markStreamAsRead(parsedRequest.user.userId, streamId);

    invalidateUserCache(parsedRequest.user.userId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return logAndRespondError("Mark all read error", error);
  }
}
