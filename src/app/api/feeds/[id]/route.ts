import type { NextRequest } from "next/server";

import * as feedsRoute from "@/app/api/feeds";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * @param request
 * @param _context
 */
export async function DELETE(request: NextRequest, _context: RouteContext) {
  return feedsRoute.DELETE(request);
}

/**
 * @param request
 * @param _context
 */
export async function PATCH(request: NextRequest, _context: RouteContext) {
  return feedsRoute.PATCH(request);
}
