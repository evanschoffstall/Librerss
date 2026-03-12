import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    error:
      "Use /api/greader.php/accounts/ClientLogin or /api/greader.php/reader/api/0/*",
  });
}
