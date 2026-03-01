import { requireAuthenticatedUser } from "@/lib/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof Response) return authResult;

  const raw = process.env.ARTICLE_EXTRACT_PROXY_URL?.trim();
  return NextResponse.json({ configured: Boolean(raw) });
}
