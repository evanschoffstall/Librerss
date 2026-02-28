import { rateLimiter } from "@/lib/server";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  requireMutableAuthenticatedUser,
  requireMutableRequest,
} from "@/lib/server";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

function buildMutableRequest(cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      ...(cookie ? { cookie } : {}),
    },
  });
}

describe("request guards rate-limit scope", () => {
  test("requireMutableRequest applies request-scoped key unchanged", () => {
    const originalCheck = rateLimiter.check;
    const check = mock(() => null);
    rateLimiter.check = check as unknown as typeof rateLimiter.check;

    try {
      const request = buildMutableRequest();
      const response = requireMutableRequest(request, {
        rateLimit: {
          key: "mutation",
          windowMs: 60_000,
          maxAttempts: 5,
          scope: "request",
        },
      });

      expect(response).toBeNull();
      expect(check).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledWith(
        request,
        "mutation",
        expect.objectContaining({ windowMs: 60_000, maxAttempts: 5 }),
      );
    } finally {
      rateLimiter.check = originalCheck;
    }
  });

  test("requireMutableAuthenticatedUser applies user-scoped limiting only after auth succeeds", async () => {
    const originalCheck = rateLimiter.check;
    const check = mock(() => null);
    rateLimiter.check = check as unknown as typeof rateLimiter.check;

    try {
      const request = buildMutableRequest();

      const result = await requireMutableAuthenticatedUser(request, {
        rateLimit: {
          key: "article-extract",
          windowMs: 60_000,
          maxAttempts: 5,
          scope: "user",
        },
      });

      if (result instanceof Response) {
        expect(result.status).toBe(401);
        expect(check).toHaveBeenCalledTimes(0);
        return;
      }

      expect(result).toEqual(
        expect.objectContaining({ userId: expect.any(Number) }),
      );
      expect(check).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledWith(
        request,
        `article-extract:user:${result.userId}`,
        expect.objectContaining({ windowMs: 60_000, maxAttempts: 5 }),
      );
    } finally {
      rateLimiter.check = originalCheck;
    }
  });
});
