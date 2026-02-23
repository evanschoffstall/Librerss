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
  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  return user;
}

type MutationRequestOptions = {
  rateLimit?: {
    key: string;
    windowMs: number;
    maxAttempts: number;
  };
};

export function requireMutableRequest(
  request: Request,
  options?: MutationRequestOptions,
): Response | null {
  if (options?.rateLimit) {
    const rateLimitError = rateLimiter.check(request, options.rateLimit.key, {
      windowMs: options.rateLimit.windowMs,
      maxAttempts: options.rateLimit.maxAttempts,
    });

    if (rateLimitError) {
      return rateLimitError;
    }
  }

  return requireSameOrigin(request);
}

export async function requireMutableAuthenticatedUser(
  request: NextRequest,
  options?: MutationRequestOptions,
): Promise<AuthenticatedUser | Response> {
  const requestError = requireMutableRequest(request, options);
  if (requestError) {
    return requestError;
  }

  return requireAuthenticatedUser(request);
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
    error: toError(error),
  });

  return jsonError(
    options?.publicMessage ?? "Internal Server Error",
    options?.status ?? 500,
  );
}
