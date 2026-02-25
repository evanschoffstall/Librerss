import { NextResponse } from "next/server";

export function textResponse(body: string, status = 200): Response {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function notFoundResponse(): Response {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
