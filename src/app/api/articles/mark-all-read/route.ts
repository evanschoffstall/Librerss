import { asTrimmedString, parseJsonBodyOrResponse } from "@/lib/api/request";
import { jsonError } from "@/lib/api/responses";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/api/route-helpers";
import { markStreamAsRead } from "@/lib/core/mark-stream-read";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutableAuthenticatedUser(request);
    if (user instanceof Response) return user;

    const body =
      await parseJsonBodyOrResponse<Record<string, unknown>>(request);
    if (body instanceof Response) return body;

    const streamId = asTrimmedString(body.streamId);
    if (!streamId) {
      return jsonError("streamId is required", 400);
    }

    await markStreamAsRead(user.userId, streamId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return logAndRespondError("Mark all read error", error);
  }
}
