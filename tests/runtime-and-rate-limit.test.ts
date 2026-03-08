import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("core/runtime and utils/rate-limit", () => {
  test("runtime flags reflect env changes", async () => {
    const previousDb = process.env.DATABASE_URL;
    const previousSignup = process.env.ALLOW_SIGNUP;
    process.env.DATABASE_URL = "";
    process.env.ALLOW_SIGNUP = "off";

    const { RUNTIME_FLAGS, PLACEHOLDER_ADMIN_USER } =
      await import("@/lib/core/runtime");
    expect(RUNTIME_FLAGS.hasDatabaseUrl).toBe(false);
    expect(RUNTIME_FLAGS.usePlaceholderData).toBe(true);
    expect(RUNTIME_FLAGS.allowSignup).toBe(false);
    expect(PLACEHOLDER_ADMIN_USER.sessionToken).toMatch(/^[0-9a-f]{64}$/);

    process.env.DATABASE_URL = "postgres://localhost/db";
    process.env.ALLOW_SIGNUP = "yes";
    expect(RUNTIME_FLAGS.hasDatabaseUrl).toBe(true);
    expect(RUNTIME_FLAGS.usePlaceholderData).toBe(false);
    expect(RUNTIME_FLAGS.allowSignup).toBe(true);

    process.env.DATABASE_URL = previousDb;
    process.env.ALLOW_SIGNUP = previousSignup;
  });

  test("runtime flags default signup to disabled when ALLOW_SIGNUP is unset", async () => {
    const previousSignup = process.env.ALLOW_SIGNUP;
    delete process.env.ALLOW_SIGNUP;

    const { RUNTIME_FLAGS } = await import("@/lib/core/runtime");
    expect(RUNTIME_FLAGS.allowSignup).toBe(false);

    process.env.ALLOW_SIGNUP = previousSignup;
  });

  test("rate limiter enforces limits and supports trusted proxy extraction", async () => {
    const { RateLimiter } = await import("@/lib/server");
    const limiter = new RateLimiter();

    try {
      process.env.TRUSTED_PROXY_COUNT = "1";
      const request = new Request("https://example.com/api", {
        headers: {
          "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        },
      });

      expect(
        limiter.check(request, "key", { windowMs: 1000, maxAttempts: 1 }),
      ).toBeNull();
      const blocked = limiter.check(request, "key", {
        windowMs: 1000,
        maxAttempts: 1,
      });
      expect(blocked?.status).toBe(429);
    } finally {
      limiter.destroy();
    }
  });
});
