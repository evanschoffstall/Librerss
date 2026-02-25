import { parsePositiveInt } from "@/lib/api/request";
import { jsonError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const articleId = parsePositiveInt(id);

  if (!articleId) {
    return jsonError("articleId must be a positive integer", 400);
  }

  return NextResponse.json({ id: articleId });
}
