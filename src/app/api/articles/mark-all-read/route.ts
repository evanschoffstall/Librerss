import { NextRequest, NextResponse } from "next/server";

import { asTrimmedString, jsonError } from "@/lib/api/http";
import { markStreamRead, serverApi } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * @param request
 */
export async function POST(request: NextRequest) {
  try {
    const parsedRequest =
      await serverApi.requireMutableUserAndJsonBody(request);
    if (parsedRequest instanceof Response) return parsedRequest;

    const streamId = asTrimmedString(parsedRequest.body.streamId);
    if (!streamId) return jsonError("streamId is required", 400);
    if (streamId.length > 512) return jsonError("streamId too long", 400);

    await markStreamRead(parsedRequest.user.userId, streamId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError)
      return jsonError(error.message, error.status);
    return serverApi.logAndRespondError("Mark all read error", error);
  }
}
