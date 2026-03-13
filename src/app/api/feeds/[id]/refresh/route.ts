import { type NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, _context?: RouteContext) {
  const auth = await requireAuthenticatedUser(request);
  if (auth instanceof Response) return auth;
  return NextResponse.json(
    { error: "Feed refresh not implemented" },
    { status: 501 },
  );
}
