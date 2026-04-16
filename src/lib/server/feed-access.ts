import { NextRequest } from "next/server";

import { jsonError } from "@/lib/api/http";
import { RUNTIME_FLAGS } from "@/lib/core/placeholder";

import * as serverApi from "./server-api";

const FEED_MANAGEMENT_DISABLED_ERROR =
  "Feed source management is disabled when DATABASE_URL is not configured";

export async function requireMutableFeedAccess(
  request: NextRequest,
  options?: {
    rateLimit?: {
      key: string;
      maxAttempts: number;
      windowMs: number;
    };
  },
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
