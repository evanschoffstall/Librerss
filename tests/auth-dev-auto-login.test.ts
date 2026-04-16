import { describe, expect, test } from "bun:test";

import {
  buildDevAutoLoginFailurePath,
  buildDevAutoLoginRequestPath,
  getDevAutoLoginCredentials,
  isDevAutoLoginEnabled,
  isDevAutoLoginFailure,
} from "@/lib/auth/dev-auto-login";

const mutableEnv = process.env as Record<string, string | undefined>;

function withDevAutoLoginEnv(
  env: Partial<
    Record<
      | "DEV_AUTO_LOGIN_EMAIL"
      | "DEV_AUTO_LOGIN_PASSWORD"
      | "NODE_ENV"
      | "PLAYWRIGHT_NEXT_DIST_DIR"
      | "PLAYWRIGHT_PORT",
      string | undefined
    >
  >,
  callback: () => void,
) {
  const previousEnv = {
    DEV_AUTO_LOGIN_EMAIL: mutableEnv.DEV_AUTO_LOGIN_EMAIL,
    DEV_AUTO_LOGIN_PASSWORD: mutableEnv.DEV_AUTO_LOGIN_PASSWORD,
    NODE_ENV: mutableEnv.NODE_ENV,
    PLAYWRIGHT_NEXT_DIST_DIR: mutableEnv.PLAYWRIGHT_NEXT_DIST_DIR,
    PLAYWRIGHT_PORT: mutableEnv.PLAYWRIGHT_PORT,
  };

  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete mutableEnv[key];
      } else {
        mutableEnv[key] = value;
      }
    }

    callback();
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete mutableEnv[key];
      } else {
        mutableEnv[key] = value;
      }
    }
  }
}

describe("dev auto-login env helper", () => {
  test("returns null outside development", () => {
    withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "production",
      },
      () => {
        expect(getDevAutoLoginCredentials()).toBeNull();
        expect(isDevAutoLoginEnabled()).toBe(false);
      },
    );
  });

  test("returns normalized credentials when both env vars are set in development", () => {
    withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: " Reader@Example.com ",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      () => {
        expect(getDevAutoLoginCredentials()).toEqual({
          email: "reader@example.com",
          password: "Password123!",
        });
        expect(isDevAutoLoginEnabled()).toBe(true);
      },
    );
  });

  test("stays disabled inside the Playwright runtime", () => {
    withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
        PLAYWRIGHT_PORT: "3100",
      },
      () => {
        expect(getDevAutoLoginCredentials()).toBeNull();
        expect(isDevAutoLoginEnabled()).toBe(false);
      },
    );
  });

  test("stays disabled when the Playwright dist-dir marker is present", () => {
    withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
        PLAYWRIGHT_NEXT_DIST_DIR: ".next-playwright.123",
      },
      () => {
        expect(getDevAutoLoginCredentials()).toBeNull();
        expect(isDevAutoLoginEnabled()).toBe(false);
      },
    );
  });

  test("throws when only one env var is configured", () => {
    withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: undefined,
        NODE_ENV: "development",
      },
      () => {
        expect(() => getDevAutoLoginCredentials()).toThrow(
          "DEV_AUTO_LOGIN_EMAIL and DEV_AUTO_LOGIN_PASSWORD must both be set in development",
        );
      },
    );
  });

  test("throws when the configured email is invalid", () => {
    withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "not-an-email",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      () => {
        expect(() => getDevAutoLoginCredentials()).toThrow(
          "DEV_AUTO_LOGIN_EMAIL must contain a valid email address",
        );
      },
    );
  });

  test("throws when the configured password is blank", () => {
    withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "   ",
        NODE_ENV: "development",
      },
      () => {
        expect(() => getDevAutoLoginCredentials()).toThrow(
          "DEV_AUTO_LOGIN_PASSWORD must not be empty in development",
        );
      },
    );
  });

  test("preserves existing dashboard query params on failure redirects", () => {
    expect(buildDevAutoLoginFailurePath("/dashboard?tab=feeds")).toBe(
      "/dashboard?tab=feeds&devLogin=failed",
    );
    expect(buildDevAutoLoginRequestPath("/dashboard?tab=feeds")).toBe(
      "/api/auth/dev-login?returnTo=%2Fdashboard%3Ftab%3Dfeeds",
    );
    expect(isDevAutoLoginFailure("failed")).toBe(true);
    expect(isDevAutoLoginFailure(["failed", "ignored"])).toBe(true);
    expect(buildDevAutoLoginFailurePath()).toBe("/dashboard?devLogin=failed");
    expect(buildDevAutoLoginRequestPath()).toBe(
      "/api/auth/dev-login?returnTo=%2Fdashboard",
    );
    expect(isDevAutoLoginFailure("pending")).toBe(false);
    expect(isDevAutoLoginFailure(undefined)).toBe(false);
  });
});
