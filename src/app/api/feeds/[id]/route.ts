import * as feedsRoute from "@/app/api/feeds/route";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, _context: RouteContext) {
  return feedsRoute.PATCH(request);
}

export async function DELETE(request: NextRequest, _context: RouteContext) {
  return feedsRoute.DELETE(request);
}
