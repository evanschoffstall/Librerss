import { NextRequest, NextResponse } from "next/server";

import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import {
  getCategoryOrder,
  requireMutableFeedAccess,
  saveCategoryOrder,
  serverApi,
} from "@/lib/server";

/**
 * Render the get component.
 * @param request - The request.
 * @returns The rendered get component.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await serverApi.requireAuthenticatedUser(request);
    if (user instanceof Response) return user;

    const labels = await getCategoryOrder(user.userId);
    return NextResponse.json({ orderedLabels: labels });
  } catch (error) {
    if (error instanceof serverApi.ServerServiceError)
      return jsonError(error.message, error.status);
    return serverApi.logAndRespondError("Error reading category order", error);
  }
}

/**
 * Render the put component.
 * @param request - The request.
 * @returns The rendered put component.
 */
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
    if (error instanceof serverApi.ServerServiceError)
      return jsonError(error.message, error.status);
    return serverApi.logAndRespondError("Error saving category order", error);
  }
}
