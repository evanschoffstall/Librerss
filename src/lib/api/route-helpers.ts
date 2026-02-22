import { getUserFromRequest } from "@/lib/auth/session";
import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";

export type AuthenticatedUser = NonNullable<
  Awaited<ReturnType<typeof getUserFromRequest>>
>;

export function jsonError(error: string, status: number): Response {
  return NextResponse.json({ error }, { status });
}

export async function requireAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | Response> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  return user;
}

export function logAndRespondError(
  message: string,
  error: unknown,
  options?: {
    status?: number;
    publicMessage?: string;
  },
): Response {
  logger.error(message, {
    error: error instanceof Error ? error : new Error(String(error)),
  });

  return jsonError(
    options?.publicMessage ?? "Internal Server Error",
    options?.status ?? 500,
  );
}
