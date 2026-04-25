import { describe, expect, test } from "bun:test";

import {
  buildPlaywrightBaseUrl,
  resolvePlaywrightBaseUrl,
} from "../scripts/playwright-base-url";

describe("playwright base URL resolution", () => {
  test("prefers the wrapper-provided PLAYWRIGHT_BASE_URL", () => {
    expect(
      resolvePlaywrightBaseUrl({
        PLAYWRIGHT_BASE_URL: "http://localhost:4567/",
        PLAYWRIGHT_HOST: "127.0.0.1",
        PLAYWRIGHT_PORT: "3100",
      }),
    ).toBe("http://localhost:4567");
  });

  test("falls back to the wrapper host and port when no base URL is injected", () => {
    expect(
      resolvePlaywrightBaseUrl({
        PLAYWRIGHT_HOST: "localhost",
        PLAYWRIGHT_PORT: "3456",
      }),
    ).toBe("http://localhost:3456");
  });

  test("uses the repo defaults when no wrapper env vars are present", () => {
    expect(resolvePlaywrightBaseUrl({})).toBe("http://127.0.0.1:3100");
  });

  test("validates that constructed ports are in TCP range", () => {
    expect(() => buildPlaywrightBaseUrl("127.0.0.1", 0)).toThrow(
      "PLAYWRIGHT_PORT must be a valid TCP port.",
    );
  });

  test("validates that the constructed host is not blank", () => {
    expect(() => buildPlaywrightBaseUrl("   ", 3100)).toThrow(
      "PLAYWRIGHT_HOST must not be empty.",
    );
  });
});
