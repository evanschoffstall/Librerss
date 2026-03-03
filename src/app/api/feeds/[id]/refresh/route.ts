import { requireAuthenticatedUser } from "@/lib/server";
import { type NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, _context?: RouteContext) {
  const auth = await requireAuthenticatedUser(request);
  if (auth instanceof Response) return auth;
  return NextResponse.json(
    { error: "Feed refresh not implemented" },
    { status: 501 },
  );
}
