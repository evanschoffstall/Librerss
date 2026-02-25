import {
  type AuthenticatedUser,
  requireMutableAuthenticatedUser,
} from "@/lib/api/request-guards";
import { jsonError } from "@/lib/api/responses";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { NextRequest } from "next/server";

const FEED_MANAGEMENT_DISABLED_ERROR =
  "Feed source management is disabled when DATABASE_URL is not configured";

export async function requireMutableFeedAccess(
  request: NextRequest,
  options?: {
    rateLimit?: {
      key: string;
      windowMs: number;
      maxAttempts: number;
    };
  },
): Promise<AuthenticatedUser | Response> {
  const user = await requireMutableAuthenticatedUser(request, {
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

  const feedManagementDisabledResponse = ensureFeedManagementEnabled();
  if (feedManagementDisabledResponse) {
    return feedManagementDisabledResponse;
  }

  return user;
}

function ensureFeedManagementEnabled(): Response | null {
  if (!RUNTIME_FLAGS.usePlaceholderData) {
    return null;
  }

  return jsonError(FEED_MANAGEMENT_DISABLED_ERROR, 503);
}
