import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  deleteSessionByToken,
} from "@/src/lib/auth/session";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.split("=")[1];

    if (token) {
      await deleteSessionByToken(decodeURIComponent(token));
    }

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
