import { NextResponse } from "next/server";

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function forbiddenResponse(message = "Forbidden"): NextResponse {
  return jsonError(message, 403);
}

export function textResponse(body: string, status = 200): Response {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function notFoundResponse(message = "Not found"): Response {
  return jsonError(message, 404);
}
