import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { EXTRACT_403_RETRIES, fetchHtml } from "@/lib/extract";
import { GotScrapingError } from "@/lib/fetch/response";

const TEST_URL = "https://example.com/article";
const TEST_HTML = "<html><body>Test content</body></html>";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

function createScrapingError(
  statusCode: number,
  responseBody = "blocked",
  responseHeaders: Record<string, string> = {},
): GotScrapingError {
  return new GotScrapingError(
    statusCode,
    responseBody,
    "direct",
    null,
    135,
    false,
    0,
    responseHeaders,
    {},
  );
}

describe("fetchHtml", () => {
  test("returns HTML from the HTTPCloak transport", async () => {
    const httpCloakFetchFn = mock(async () => ({
      html: TEST_HTML,
      requestHeaders: {},
    }));

    const result = await fetchHtml(TEST_URL, {
      httpCloakFetchFn,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(result).toBe(TEST_HTML);
    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });

  test("blocks disallowed URLs before any upstream request", async () => {
    const httpCloakFetchFn = mock(async (_url, isAllowedUrl) => {
      const isAllowed = await isAllowedUrl(TEST_URL);

      if (!isAllowed) {
        throw new Error("Blocked URL");
      }

      return {
        html: TEST_HTML,
        requestHeaders: {},
      };
    });

    await expect(
      fetchHtml(TEST_URL, {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => false,
      }),
    ).rejects.toThrow("Blocked URL");

    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });

  test("passes transport-only options when proxy mode is enabled", async () => {
    const httpCloakFetchFn = mock(async (_url, _validator, options) => {
      expect(options).toEqual({
        allowInsecureTls: true,
        proxyUrl: "http://proxy.example.com:8080",
      });

      return {
        html: TEST_HTML,
        requestHeaders: {},
      };
    });

    const result = await fetchHtml(
      TEST_URL,
      {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      },
      {
        allowInsecureTls: true,
        proxyUrl: "http://proxy.example.com:8080",
        useProxy: true,
      },
    );

    expect(result).toBe(TEST_HTML);
    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });

  test("ignores proxyUrl when useProxy is false", async () => {
    const httpCloakFetchFn = mock(async (_url, _validator, options) => {
      expect(options).toEqual({
        allowInsecureTls: false,
        proxyUrl: undefined,
      });

      return {
        html: TEST_HTML,
        requestHeaders: {},
      };
    });

    const result = await fetchHtml(
      TEST_URL,
      {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      },
      {
        proxyUrl: "http://proxy.example.com:8080",
        useProxy: false,
      },
    );

    expect(result).toBe(TEST_HTML);
  });

  test("retries generic 403 responses up to the configured limit", async () => {
    let attemptCount = 0;
    const httpCloakFetchFn = mock(async () => {
      attemptCount += 1;

      if (attemptCount <= EXTRACT_403_RETRIES) {
        throw createScrapingError(403, "blocked");
      }

      return {
        html: TEST_HTML,
        requestHeaders: {},
      };
    });

    const result = await fetchHtml(TEST_URL, {
      delayFn: async () => {},
      httpCloakFetchFn,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(result).toBe(TEST_HTML);
    expect(attemptCount).toBe(EXTRACT_403_RETRIES + 1);
  });

  test("retries rate-limited responses", async () => {
    let attemptCount = 0;
    const httpCloakFetchFn = mock(async () => {
      attemptCount += 1;

      if (attemptCount === 1) {
        throw createScrapingError(429, "rate limited", { "retry-after": "5" });
      }

      return {
        html: TEST_HTML,
        requestHeaders: {},
      };
    });

    const result = await fetchHtml(TEST_URL, {
      delayFn: async () => {},
      httpCloakFetchFn,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(result).toBe(TEST_HTML);
    expect(attemptCount).toBe(2);
  });

  test("does not retry DataDome access responses", async () => {
    let attemptCount = 0;
    const httpCloakFetchFn = mock(async () => {
      attemptCount += 1;
      throw createScrapingError(403, "blocked", { "x-datadome": "protected" });
    });

    await expect(
      fetchHtml(TEST_URL, {
        delayFn: async () => {},
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("DataDome");

    expect(attemptCount).toBe(1);
  });

  test("does not retry PerimeterX access responses", async () => {
    let attemptCount = 0;
    const httpCloakFetchFn = mock(async () => {
      attemptCount += 1;
      throw createScrapingError(403, "<html>px-captcha challenge</html>", {
        "x-px-original-token": "token",
      });
    });

    await expect(
      fetchHtml(TEST_URL, {
        delayFn: async () => {},
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("PerimeterX");

    expect(attemptCount).toBe(1);
  });

  test("rethrows the last error after exhausting retries", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw createScrapingError(403, "blocked");
    });

    await expect(
      fetchHtml(TEST_URL, {
        delayFn: async () => {},
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("403");

    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1 + EXTRACT_403_RETRIES);
  });

  test("rethrows non-retryable errors immediately", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw new Error("network failure");
    });

    await expect(
      fetchHtml(TEST_URL, {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("network failure");

    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });
});
