import { NextRequest, NextResponse } from "next/server";

import { requireMutableFeedAccess } from "@/lib/api/feeds/access";
import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { logAndRespondError, requireAuthenticatedUser } from "@/lib/server";
import {
  getCategoryOrder,
  saveCategoryOrder,
  ServiceError,
} from "@/lib/server/services";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof Response) return user;

    const labels = await getCategoryOrder(user.userId);
    return NextResponse.json({ orderedLabels: labels });
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return logAndRespondError("Error reading category order", error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireMutableFeedAccess(request);
    if (user instanceof Response) return user;

    const bodyOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (bodyOrResponse instanceof Response) return bodyOrResponse;

    const { orderedLabels } = bodyOrResponse;
    if (!Array.isArray(orderedLabels)) {
      return jsonError("orderedLabels must be an array of strings", 400);
    }

    const labels = orderedLabels.filter(
      (item): item is string => typeof item === "string",
    );
    const saved = await saveCategoryOrder(user.userId, labels);
    return NextResponse.json({ orderedLabels: saved });
  } catch (error) {
    if (error instanceof ServiceError) return jsonError(error.message, error.status);
    return logAndRespondError("Error saving category order", error);
  }
}
