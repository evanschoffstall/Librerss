import type { NextRequest } from "next/server";

import { jsonError } from "@/lib/api/http";
import { RUNTIME_FLAGS } from "@/lib/core/placeholder";

import * as serverApi from "./server-api";

const FEED_MANAGEMENT_DISABLED_ERROR =
  "Feed source management is disabled when DATABASE_URL is not configured";
interface RequireMutableFeedAccessOptions {
  rateLimit?: {
    key: string;
    maxAttempts: number;
    windowMs: number;
  };
}

/**
 * Process the require mutable feed access.
 * @param request - The request.
 * @param options - The options used to process the require mutable feed access.
 * @returns The require mutable feed access.
 */
export async function requireMutableFeedAccess(
  request: NextRequest,
  options?: RequireMutableFeedAccessOptions,
): Promise<Response | serverApi.AuthenticatedUser> {
  const user = await serverApi.requireMutableAuthenticatedUser(request, {
    rateLimit: options?.rateLimit
      ? {
          ...options.rateLimit,
          scope: "user",
        }
      : undefined,
  });
  if (user instanceof Response) {
    return user;
  }

  if (RUNTIME_FLAGS.usePlaceholderData) {
    return jsonError(FEED_MANAGEMENT_DISABLED_ERROR, 503);
  }

  return user;
}
