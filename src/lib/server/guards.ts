import { NextRequest } from "next/server";

import { rateLimiter } from "./rate-limit";

import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { logger } from "@/lib/logger";
import { toError } from "@/lib/utils/errors";

export type AuthenticatedUser = NonNullable<
  Awaited<ReturnType<typeof getUserFromRequest>>
>;

interface MutationRequestOptions {
  rateLimit?: {
    key: string;
    maxAttempts: number;
    // "request" = keyed by client IP (no auth required).
    // "user"    = keyed by userId (checked after auth in requireMutableAuthenticatedUser).
    scope?: "request" | "user";
    windowMs: number;
  };
}

export function logAndRespondError(
  message: string,
  error: unknown,
  options?: {
    publicMessage?: string;
    status?: number;
  },
): Response {
  logger.error(message, { error: toError(error) });
  return jsonError(
    options?.publicMessage ?? "Internal Server Error",
    options?.status ?? 500,
  );
}

export async function requireAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | Response> {
  // In placeholder mode, bypass authentication entirely
  if (RUNTIME_FLAGS.usePlaceholderData) {
    return {
      email: PLACEHOLDER_ADMIN_USER.email,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      sessionId: 0,
      userId: PLACEHOLDER_ADMIN_USER.id,
    };
  }

  const user = await getUserFromRequest(request);
  if (!user) return jsonError("Unauthorized", 401);
  return user;
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
      { maxAttempts: rl.maxAttempts, windowMs: rl.windowMs },
    );
    if (rateLimitError) return rateLimitError;
  }

  return user;
}

// Validates CSRF and applies request-scoped (IP-based) rate limiting.
// User-scoped rate limiting is handled separately in requireMutableAuthenticatedUser
// because it requires a resolved userId.
export function requireMutableRequest(
  request: Request,
  options?: MutationRequestOptions,
): null | Response {
  const sameOriginError = requireSameOrigin(request);
  if (sameOriginError) return sameOriginError;

  const rl = options?.rateLimit;
  if (rl && (rl.scope ?? "request") === "request") {
    const rateLimitError = rateLimiter.check(request, rl.key, {
      maxAttempts: rl.maxAttempts,
      windowMs: rl.windowMs,
    });
    if (rateLimitError) return rateLimitError;
  }

  return null;
}

export async function requireMutableUserAndJsonBody<TBody extends object>(
  request: NextRequest,
  options?: MutationRequestOptions,
): Promise<Response | { body: TBody; user: AuthenticatedUser }> {
  const user = await requireMutableAuthenticatedUser(request, options);
  if (user instanceof Response) {
    return user;
  }

  const body = await parseJsonObjectBodyOrResponse(request);
  if (body instanceof Response) {
    return body;
  }

  return { body: body as TBody, user };
}
