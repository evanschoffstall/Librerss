import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { toError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { rateLimiter } from "@/lib/utils/rate-limit";
import { NextRequest } from "next/server";
import { jsonError } from "./responses";

export type AuthenticatedUser = NonNullable<
  Awaited<ReturnType<typeof getUserFromRequest>>
>;

export async function requireAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | Response> {
  const user = await getUserFromRequest(request);
  if (!user) return jsonError("Unauthorized", 401);
  return user;
}

type MutationRequestOptions = {
  rateLimit?: {
    key: string;
    windowMs: number;
    maxAttempts: number;
    // "request" = keyed by client IP (no auth required).
    // "user"    = keyed by userId (checked after auth in requireMutableAuthenticatedUser).
    scope?: "request" | "user";
  };
};

// Validates CSRF and applies request-scoped (IP-based) rate limiting.
// User-scoped rate limiting is handled separately in requireMutableAuthenticatedUser
// because it requires a resolved userId.
export function requireMutableRequest(
  request: Request,
  options?: MutationRequestOptions,
): Response | null {
  const sameOriginError = requireSameOrigin(request);
  if (sameOriginError) return sameOriginError;

  const rl = options?.rateLimit;
  if (rl && (rl.scope ?? "request") === "request") {
    const rateLimitError = rateLimiter.check(request, rl.key, {
      windowMs: rl.windowMs,
      maxAttempts: rl.maxAttempts,
    });
    if (rateLimitError) return rateLimitError;
  }

  return null;
}

export async function requireMutableAuthenticatedUser(
  request: NextRequest,
  options?: MutationRequestOptions,
): Promise<AuthenticatedUser | Response> {
  const requestError = requireMutableRequest(request, options);
  if (requestError) return requestError;

  const user = await requireAuthenticatedUser(request);
  if (user instanceof Response) return user;

  const rl = options?.rateLimit;
  if (rl && (rl.scope ?? "request") === "user") {
    const rateLimitError = rateLimiter.check(
      request,
      `${rl.key}:user:${user.userId}`,
      { windowMs: rl.windowMs, maxAttempts: rl.maxAttempts },
    );
    if (rateLimitError) return rateLimitError;
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
  logger.error(message, { error: toError(error) });
  return jsonError(options?.publicMessage ?? "Internal Server Error", options?.status ?? 500);
}
