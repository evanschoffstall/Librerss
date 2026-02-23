import { jsonError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const articleId = Number(id);

  if (!Number.isInteger(articleId) || articleId <= 0) {
    return jsonError("articleId must be a positive integer", 400);
  }

  return NextResponse.json({ id: articleId });
}
