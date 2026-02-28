import { requireMutableFeedAccess } from "@/lib/api/feeds/access";
import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { getDb } from "@/lib/db/db";
import { categoryOrders } from "@/lib/db/schema";
import { logAndRespondError, requireAuthenticatedUser } from "@/lib/server";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof Response) {
      return user;
    }

    const db = getDb();
    const [row] = await db
      .select({ orderedLabels: categoryOrders.orderedLabels })
      .from(categoryOrders)
      .where(eq(categoryOrders.userId, user.userId))
      .limit(1);

    const labels: string[] = row ? safeParseLabelArray(row.orderedLabels) : [];
    return NextResponse.json({ orderedLabels: labels });
  } catch (error) {
    return logAndRespondError("Error reading category order", error);
  }
}

/**
 * Safely parses the stored JSON string into a string array.
 * Returns an empty array if the value is malformed.
 */
function safeParseLabelArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireMutableFeedAccess(request);
    if (user instanceof Response) {
      return user;
    }

    const bodyOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (bodyOrResponse instanceof Response) {
      return bodyOrResponse;
    }

    const { orderedLabels } = bodyOrResponse;
    if (!Array.isArray(orderedLabels)) {
      return jsonError("orderedLabels must be an array of strings", 400);
    }

    const labels = orderedLabels.filter(
      (item): item is string => typeof item === "string",
    );

    const db = getDb();
    const serializedLabels = JSON.stringify(labels);
    await db
      .insert(categoryOrders)
      .values({
        userId: user.userId,
        orderedLabels: serializedLabels,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: categoryOrders.userId,
        set: {
          orderedLabels: serializedLabels,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ orderedLabels: labels });
  } catch (error) {
    return logAndRespondError("Error saving category order", error);
  }
}
