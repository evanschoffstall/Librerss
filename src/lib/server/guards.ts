import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { logger } from "@/lib/logger";
import { toError } from "@/lib/utils/errors";
import { NextRequest } from "next/server";
import { rateLimiter } from "./rate-limit";

export type AuthenticatedUser = NonNullable<
  Awaited<ReturnType<typeof getUserFromRequest>>
>;

export async function requireAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | Response> {
  // In placeholder mode, bypass authentication entirely
  if (RUNTIME_FLAGS.usePlaceholderData) {
    return {
      sessionId: 0,
      userId: PLACEHOLDER_ADMIN_USER.id,
      email: PLACEHOLDER_ADMIN_USER.email,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    };
  }

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

/**
 * Like requireMutableAuthenticatedUser but skips the user auth check.
 * Use for read-only proxy endpoints (e.g. article extraction) that are safe
 * to expose publicly — CSRF origin check and IP-based rate limiting still apply.
 */
export async function requireMutablePublicRequest(
  request: NextRequest,
  options?: MutationRequestOptions,
): Promise<AuthenticatedUser | Response> {
  const requestError = requireMutableRequest(request, {
    ...options,
    rateLimit: options?.rateLimit
      ? { ...options.rateLimit, scope: "request" as const }
      : undefined,
  });
  if (requestError) return requestError;
  // Return an anonymous identity — userId -1 is distinct from any real DB row
  // and from PLACEHOLDER_ADMIN_USER.id (0).
  return {
    sessionId: -1,
    userId: -1,
    email: "anonymous",
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

export async function requireMutableUserAndJsonBody<
  TBody extends Record<string, unknown>,
>(
  request: NextRequest,
  options?: MutationRequestOptions,
): Promise<{ user: AuthenticatedUser; body: TBody } | Response> {
  const user = await requireMutableAuthenticatedUser(request, options);
  if (user instanceof Response) {
    return user;
  }

  const body = await parseJsonObjectBodyOrResponse(request);
  if (body instanceof Response) {
    return body;
  }

  return { user, body: body as TBody };
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
  return jsonError(
    options?.publicMessage ?? "Internal Server Error",
    options?.status ?? 500,
  );
}
