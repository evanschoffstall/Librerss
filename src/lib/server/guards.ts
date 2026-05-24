import type { NextRequest } from "next/server";

import { logger } from "@/lib";
import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { getUserFromRequest, requireSameOrigin } from "@/lib/auth";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/placeholder";
import { toError } from "@/lib/utils";

import { rateLimiter } from "./rate-limit";

/**
 * Defines the authenticated user type.
 */
export type AuthenticatedUser = NonNullable<
  Awaited<ReturnType<typeof getUserFromRequest>>
>;

/**
 * Describes the options for log and respond error.
 */
interface LogAndRespondErrorOptions {
  publicMessage?: string;
  status?: number;
}
/**
 * Describes the options for mutation request.
 */
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

/**
 * Process the log and respond error.
 * @param message - The message.
 * @param error - The error.
 * @param options - The options used to process the log and respond error.
 * @returns The log and respond error.
 */
export function logAndRespondError(
  message: string,
  error: unknown,
  options?: LogAndRespondErrorOptions,
): Response {
  const logError =
    typeof logger.error === "function" ? logger.error.bind(logger) : undefined;
  logError?.(message, { error: toError(error) });
  return jsonError(
    options?.publicMessage ?? "Internal Server Error",
    options?.status ?? 500,
  );
}

/**
 * Process the require authenticated user.
 * @param request - The request.
 * @returns The require authenticated user.
 */
export async function requireAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | Response> {
  // In placeholder mode, bypass authentication entirely
  if (RUNTIME_FLAGS.usePlaceholderData) {
    return {
      email: PLACEHOLDER_ADMIN_USER.email,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      isAdmin: PLACEHOLDER_ADMIN_USER.isAdmin,
      sessionId: 0,
      userId: PLACEHOLDER_ADMIN_USER.id,
    };
  }

  const user = await getUserFromRequest(request);
  if (!user) return jsonError("Unauthorized", 401);
  return user;
}

/**
 * Process the require mutable authenticated user.
 * @param request - The request.
 * @param options - The options used to process the require mutable authenticated user.
 * @returns The require mutable authenticated user.
 */
export async function requireMutableAuthenticatedUser(
  request: NextRequest,
  options?: MutationRequestOptions,
): Promise<AuthenticatedUser | Response> {
  const requestError = requireMutableRequest(request, options);
  if (requestError) return requestError;

  const user = await requireAuthenticatedUser(request);
  if (user instanceof Response) return user;

  const rateLimit = options?.rateLimit;
  if (rateLimit && (rateLimit.scope ?? "request") === "user") {
    // The key already contains the userId, so there is no need to append a
    // client-IP suffix.  Skipping the suffix ensures:
    //   1. One contiguous quota window per user regardless of IP changes.
    //   2. No accidental per-IP bucket splits when the IP is unresolvable.
    const rateLimitError = rateLimiter.check(
      request,
      `${rateLimit.key}:user:${user.userId}`,
      { maxAttempts: rateLimit.maxAttempts, windowMs: rateLimit.windowMs },
      true, // skipClientId — userId is the identity
    );
    if (rateLimitError) return rateLimitError;
  }

  return user;
}

// Validates CSRF and applies request-scoped (IP-based) rate limiting.
// User-scoped rate limiting is handled separately in requireMutableAuthenticatedUser
// because it requires a resolved userId.
/**
 * Process the require mutable request.
 * @param request - The request.
 * @param options - The options used to process the require mutable request.
 * @returns The require mutable request.
 */
export function requireMutableRequest(
  request: Request,
  options?: MutationRequestOptions,
): null | Response {
  const sameOriginError = requireSameOrigin(request);
  if (sameOriginError) return sameOriginError;

  const rateLimit = options?.rateLimit;
  if (rateLimit && (rateLimit.scope ?? "request") === "request") {
    const rateLimitError = rateLimiter.check(request, rateLimit.key, {
      maxAttempts: rateLimit.maxAttempts,
      windowMs: rateLimit.windowMs,
    });
    if (rateLimitError) return rateLimitError;
  }

  return null;
}

/**
 * Process the require mutable user and json body.
 * @param request - The request.
 * @param options - The options used to process the require mutable user and json body.
 * @returns The require mutable user and json body.
 */
export async function requireMutableUserAndJsonBody<
  TBody extends object = Record<string, unknown>,
>(
  request: NextRequest,
  options?: MutationRequestOptions & { __bodyType?: TBody },
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
