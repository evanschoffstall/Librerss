import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { EXTRACT_403_RETRIES, fetchHtml } from "@/lib/extract";
import { HttpCloakUpstreamError } from "@/lib/fetch/response";
import { logger } from "@/lib/logger";

const TEST_URL = "https://example.com/article";
const TEST_HTML = "<html><body>Test content</body></html>";
const originalLoggerInfo = logger.info;
const originalLoggerWarn = logger.warn;
const originalLoggerError = logger.error;

beforeEach(() => {
  mock.restore();
  logger.info = (() => {}) as typeof logger.info;
  logger.warn = (() => {}) as typeof logger.warn;
  logger.error = (() => {}) as typeof logger.error;
});

afterEach(() => {
  mock.restore();
  logger.info = originalLoggerInfo;
  logger.warn = originalLoggerWarn;
  logger.error = originalLoggerError;
});

function createHttpCloakUpstreamError(
  statusCode: number,
  responseBody = "blocked",
  responseHeaders: Record<string, string> = {},
): HttpCloakUpstreamError {
  return new HttpCloakUpstreamError({
    proxyAddress: null,
    proxyMode: "direct",
    redirectHop: 0,
    requestHeaders: {},
    responseBody,
    responseHeaders,
    statusCode,
  });
}

describe("fetchHtml", () => {
  test("returns HTML from the HTTPCloak transport", async () => {
    const httpCloakFetchFn = mock(async () => ({
      diagnosticHeaders: {},
      html: TEST_HTML,
      redirectHop: 0,
      requestHeaders: {},
      statusCode: 200,
    }));

    const result = await fetchHtml(TEST_URL, {
      httpCloakFetchFn,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(result).toBe(TEST_HTML);
    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });

  test("logs a single merged HTTPCloak extraction success event", async () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    const originalInfo = logger.info;
    const info = mock(() => undefined);

    process.env.LOG_LEVEL = "info";
    logger.info = info;

    try {
      await fetchHtml(TEST_URL, {
        httpCloakFetchFn: async () => ({
          diagnosticHeaders: {
            "content-type": ["text/html; charset=utf-8"],
            via: ["1.1 cloudfront"],
          },
          html: TEST_HTML,
          redirectHop: 0,
          requestHeaders: { accept: "text/html" },
          statusCode: 200,
        }),
        isAllowedFeedUrlFn: async () => true,
      });

      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(
        "HTTPCloak extraction attempt 1/1 succeeded",
        expect.objectContaining({
          attempt: 1,
          attempts: 1,
          diagnosticHeaders: {
            "content-type": ["text/html; charset=utf-8"],
            via: ["1.1 cloudfront"],
          },
          headers: { accept: "text/html" },
          proxyAddress: null,
          proxyMode: "direct",
          redirectHop: 0,
          responseBodyLength: TEST_HTML.length,
          statusCode: 200,
          url: TEST_URL,
        }),
      );
    } finally {
      logger.info = originalInfo;
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  test("blocks disallowed URLs before any upstream request", async () => {
    const httpCloakFetchFn = mock(async (_url, isAllowedUrl) => {
      const isAllowed = await isAllowedUrl(TEST_URL);

      if (!isAllowed) {
        throw new Error("Blocked URL");
      }

      return {
        diagnosticHeaders: {},
        html: TEST_HTML,
        redirectHop: 0,
        requestHeaders: {},
        statusCode: 200,
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
        proxyUrl: "http://proxy.example.com:8080",
      });

      return {
        diagnosticHeaders: {},
        html: TEST_HTML,
        redirectHop: 0,
        requestHeaders: {},
        statusCode: 200,
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
        useProxy: true,
      },
    );

    expect(result).toBe(TEST_HTML);
    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });

  test("ignores proxyUrl when useProxy is false", async () => {
    const httpCloakFetchFn = mock(async (_url, _validator, options) => {
      expect(options).toEqual({
        proxyUrl: undefined,
      });

      return {
        diagnosticHeaders: {},
        html: TEST_HTML,
        redirectHop: 0,
        requestHeaders: {},
        statusCode: 200,
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

  test("makes a single attempt for generic 403 responses", async () => {
    let attemptCount = 0;
    const httpCloakFetchFn = mock(async () => {
      attemptCount += 1;
      throw createHttpCloakUpstreamError(403, "blocked");
    });

    await expect(
      fetchHtml(TEST_URL, {
        delayFn: async () => {},
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("403");

    expect(attemptCount).toBe(EXTRACT_403_RETRIES + 1);
  });

  test("surfaces rate-limited responses without retry when extract retries are disabled", async () => {
    let attemptCount = 0;
    const httpCloakFetchFn = mock(async () => {
      attemptCount += 1;

      throw createHttpCloakUpstreamError(429, "rate limited", {
        "retry-after": "5",
      });
    });

    await expect(
      fetchHtml(TEST_URL, {
        delayFn: async () => {},
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("429");

    expect(attemptCount).toBe(1);
  });

  test("does not retry DataDome access responses", async () => {
    let attemptCount = 0;
    const httpCloakFetchFn = mock(async () => {
      attemptCount += 1;
      throw createHttpCloakUpstreamError(403, "blocked", {
        "x-datadome": "protected",
      });
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
      throw createHttpCloakUpstreamError(
        403,
        "<html>px-captcha challenge</html>",
        {
          "x-px-original-token": "token",
        },
      );
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

  test("rejects Akamai access interstitials returned with HTTP 200", async () => {
    const httpCloakFetchFn = mock(async () => ({
      diagnosticHeaders: { "content-type": ["text/html"] },
      html: `
        <!doctype html>
        <html>
          <body>
            <script src="/CtzWON35h/qtzwJC/FOg/tNEwwtOV/HQMKMBYB/FlkOWmx/CBFYr"></script>
            <div id="sec-if-cpt-container" role="main" style="display: none">
              <div class="behavioral-content">
                <div class="scf-akamai-logo-sec-abc">
                  <p class="scf-akamai-protected-by">Powered and protected by</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      redirectHop: 0,
      requestHeaders: {},
      statusCode: 200,
    }));

    await expect(
      fetchHtml(TEST_URL, {
        delayFn: async () => {},
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("Akamai");

    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });

  test("rethrows the last error after the single extract attempt", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw createHttpCloakUpstreamError(403, "blocked");
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
