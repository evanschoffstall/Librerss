import type { NextRequest } from "next/server";

import {
  DELETE as handleDelete,
  PATCH as handlePatch,
} from "@/app/api/feeds/route";

/**
 * Describes the route context.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Handle the DELETE request.
 * @param request - The request.
 * @param _context - The context.
 * @returns A JSON response or error response.
 */
export async function DELETE(request: NextRequest, _context: RouteContext) {
  return handleDelete(request);
}

/**
 * Handle the PATCH request.
 * @param request - The request.
 * @param _context - The context.
 * @returns A JSON response or error response.
 */
export async function PATCH(request: NextRequest, _context: RouteContext) {
  return handlePatch(request);
}
