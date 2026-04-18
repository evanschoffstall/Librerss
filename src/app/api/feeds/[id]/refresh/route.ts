import { type NextRequest, NextResponse } from "next/server";

import { serverApi } from "@/lib/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * @param request
 * @param _context
 */
export async function POST(request: NextRequest, _context?: RouteContext) {
  const auth = await serverApi.requireAuthenticatedUser(request);
  if (auth instanceof Response) return auth;
  return NextResponse.json(
    { error: "Feed refresh not implemented" },
    { status: 501 },
  );
}
