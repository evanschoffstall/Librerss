import type { NextRequest } from "next/server";

import { DELETE as handleDelete, PATCH as handlePatch } from "@/app/api/feeds";

/**
 * Describes the route context.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Render the delete component.
 * @param request - The request.
 * @param _context - The context.
 * @returns The rendered delete component.
 */
export async function DELETE(request: NextRequest, _context: RouteContext) {
  return feedsRoute.DELETE(request);
}

/**
 * Render the patch component.
 * @param request - The request.
 * @param _context - The context.
 * @returns The rendered patch component.
 */
export async function PATCH(request: NextRequest, _context: RouteContext) {
  return feedsRoute.PATCH(request);
}
