import { NextResponse } from "next/server";

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function forbiddenResponse(message = "Forbidden"): NextResponse {
  return jsonError(message, 403);
}
