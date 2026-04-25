import { describe, expect, test } from "bun:test";

import { Logger } from "@/lib/logger";

describe("logger env fallback", () => {
  const readSupportsColor = (
    envOverrides: Record<string, string | undefined>,
  ) => {
    const previousValues = new Map<string, string | undefined>();

    for (const [key, value] of Object.entries(envOverrides)) {
      previousValues.set(key, process.env[key]);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    try {
      const logger = new Logger() as unknown as {
        supportsColor(): boolean;
      };
      return String(logger["supportsColor"]());
    } finally {
      for (const [key, value] of previousValues) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  };

  test("uses build-time LOG_COLORS_ENABLED fallback when runtime env is unset", () => {
    const supportsColor = readSupportsColor({
      LIBRERSS_BUILD_CONFIG: JSON.stringify({
        LOG_COLORS_ENABLED: "false",
        LOG_LEVEL: "info",
      }),
      LOG_COLORS_ENABLED: undefined,
      NODE_ENV: "production",
    });

    expect(supportsColor).toBe("false");
  });

  test("prefers runtime LOG_COLORS_ENABLED over build-time fallback", () => {
    const supportsColor = readSupportsColor({
      LIBRERSS_BUILD_CONFIG: JSON.stringify({
        LOG_COLORS_ENABLED: "false",
        LOG_LEVEL: "info",
      }),
      LOG_COLORS_ENABLED: "true",
      NODE_ENV: "production",
    });

    expect(supportsColor).toBe("true");
  });
});
