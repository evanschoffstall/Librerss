import { describe, expect, test } from "bun:test";

import {
  buildPlaywrightBaseUrl,
  resolvePlaywrightBaseUrl,
} from "../scripts/playwright-base-url";

describe("playwright base URL resolution", () => {
  test("prefers the wrapper-provided PLAYWRIGHT_BASE_URL", () => {
    expect(
      resolvePlaywrightBaseUrl({
        PLAYWRIGHT_BASE_URL: "http://192.168.2.117:4567/",
        PLAYWRIGHT_HOST: "127.0.0.1",
        PLAYWRIGHT_PORT: "3100",
      }),
    ).toBe("http://192.168.2.117:4567");
  });

  test("falls back to the wrapper host and port when no base URL is injected", () => {
    expect(
      resolvePlaywrightBaseUrl({
        PLAYWRIGHT_HOST: "192.168.2.117",
        PLAYWRIGHT_PORT: "3456",
      }),
    ).toBe("http://192.168.2.117:3456");
  });

  test("uses the repo defaults when no wrapper env vars are present", () => {
    expect(resolvePlaywrightBaseUrl({})).toBe("http://127.0.0.1:3100");
  });

  test("validates that constructed ports are in TCP range", () => {
    expect(() => buildPlaywrightBaseUrl("127.0.0.1", 0)).toThrow(
      "PLAYWRIGHT_PORT must be a valid TCP port.",
    );
  });
});