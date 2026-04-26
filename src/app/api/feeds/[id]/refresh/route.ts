import { type NextRequest, NextResponse } from "next/server";

import { serverApi } from "@/lib/server";

/**
 * Describes the route context.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Render the post component.
 * @param request - The request.
 * @param _context - The context.
 * @returns The rendered post component.
 */
export async function POST(request: NextRequest, _context?: RouteContext) {
  const auth = await serverApi.requireAuthenticatedUser(request);
  if (auth instanceof Response) return auth;
  return NextResponse.json(
    { error: "Feed refresh not implemented" },
    { status: 501 },
  );
}
