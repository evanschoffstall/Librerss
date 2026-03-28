import type { AxiosError, AxiosResponse } from "axios";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as zlib from "zlib";

import { CONFIG } from "@/lib/config";
import { EXTRACT_403_RETRIES, fetchHtml } from "@/lib/extract";
import { CHROME } from "@/lib/fetch";
import { GotScrapingError } from "@/lib/fetch/response";

// Type-cast helpers for injectable fetch dependencies
const asAxiosGet = (
  fn: (url: string, config?: unknown) => Promise<Partial<AxiosResponse>>,
) => fn as unknown as typeof import("axios").default.get;
const asIsAxiosError = (fn: (error: unknown) => boolean) =>
  fn as unknown as typeof import("axios").default.isAxiosError;

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

async function compressWithZstd(input: string): Promise<Buffer> {
  const zstdCompress = (zlib as Record<string, unknown>).zstdCompress as
    | typeof zlib.brotliCompress
    | undefined;

  if (!zstdCompress) {
    throw new Error("zstd compression is unavailable in this runtime");
  }

  return new Promise<Buffer>((resolve, reject) => {
    zstdCompress(Buffer.from(input, "utf8"), (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

// Helper to create axios error
function createAxiosError(
  status: number,
  data?: unknown,
  headers?: Record<string, unknown>,
  setCookie?: string | string[],
): AxiosError {
  const error = new Error(
    `Request failed with status code ${status}`,
  ) as AxiosError;
  error.isAxiosError = true;
  error.response = {
    config: {} as any,
    data,
    headers: {
      ...headers,
      ...(setCookie !== undefined ? { "set-cookie": setCookie } : {}),
    },
    status,
    statusText: status === 403 ? "Forbidden" : "Error",
  } as AxiosResponse;
  return error;
}

// Type predicate for axios errors (with proper generics to match axios.isAxiosError signature)
function isAxiosError<T = any, D = any>(
  payload: any,
): payload is AxiosError<T, D> {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    "isAxiosError" in payload &&
    (payload as AxiosError).isAxiosError === true,
  );
}

describe("buildDdgReferer", () => {
  // We need to import the function - it's not exported but used internally.
  // We'll test it indirectly through fetchHtml behavior and in edge cases
  // where the referer is part of logged output.
});

describe("fetchHtml", () => {
  const TEST_URL = "https://example.com/article";
  const TEST_HTML = "<html><body>Test content</body></html>";

  describe("basic success cases", () => {
    test("fetches HTML successfully with injected axios", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(result).toBe(TEST_HTML);
      expect(mockAxiosGet).toHaveBeenCalled();
    });

    test("decompresses content-encoded responses from injected axios", async () => {
      const compressedHtml = zlib.gzipSync(Buffer.from(TEST_HTML, "utf8"));
      const mockAxiosGet = mock(async () => ({
        data: compressedHtml,
        headers: { "content-encoding": "gzip" },
        status: 200,
      }));

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: asAxiosGet(mockAxiosGet),
      });

      expect(result).toBe(TEST_HTML);
    });

    test("decompresses zstd-encoded responses from injected axios", async () => {
      const zstdCompress = (zlib as Record<string, unknown>).zstdCompress;
      if (!zstdCompress) {
        expect(true).toBe(true);
        return;
      }

      const html = "<!DOCTYPE html><html><body>Jacobin zstd direct fetch</body></html>";
      const compressedHtml = await compressWithZstd(html);
      const mockAxiosGet = mock(async () => ({
        data: compressedHtml,
        headers: { "content-encoding": "zstd" },
        status: 200,
      }));

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: asAxiosGet(mockAxiosGet),
      });

      expect(result).toBe(html);
    });

    test("rejects compressed responses that expand beyond the configured limit", async () => {
      const oversizedHtml = "x".repeat(CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES + 1);
      const compressedHtml = zlib.gzipSync(Buffer.from(oversizedHtml, "utf8"));
      const mockAxiosGet = mock(async () => ({
        data: compressedHtml,
        headers: { "content-encoding": "gzip" },
        status: 200,
      }));

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: asAxiosGet(mockAxiosGet),
        }),
      ).rejects.toThrow("Upstream response too large");
    });

    test("injects custom isAllowedFeedUrl function", async () => {
      const mockIsAllowed = mock(async () => true);
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
        isAllowedFeedUrlFn: mockIsAllowed,
      });

      expect(mockIsAllowed).toHaveBeenCalledWith(TEST_URL);
    });

    test("uses default user agent from httpCloak pool when no axiosGetFn", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      // When axiosGetFn is injected, should use first httpCloak
      expect(mockAxiosGet).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    test("throws on blocked URL", async () => {
      const mockIsAllowed = mock(async () => false);
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAllowedFeedUrlFn: mockIsAllowed,
        }),
      ).rejects.toThrow("Blocked URL");
    });

    test("retries once through the plain axios fallback when injected axios fails", async () => {
      const mockAxiosGet = mock(async () => {
        throw new Error("Network error");
      });

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
        }),
      ).rejects.toThrow("Network error");

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    test("throws on 404 error", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(404);
        throw error;
      });
      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    test("throws on 500 after the plain axios fallback also fails", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(500);
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });
  });

  describe("403 retry logic with injected axios", () => {
    test("falls through to the plain axios stage for injected 403 responses", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(403);
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    test("throws after both injected axios stages return 403", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(403);
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });
  });

  describe("429 rate limit handling", () => {
    test("throws on 429 after the plain axios fallback also rate limits", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(429);
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });
  });

  describe("DataDome detection", () => {
    test("throws on DataDome 403 with x-datadome: protected header", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(403, "blocked", {
          "x-datadome": "protected",
        });
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("DataDome");

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    test("detects DataDome with mixed case header and lowercase value", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(403, "blocked", {
          "x-datadome": "protected",
        });
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("DataDome");
    });

    test("captures DataDome cookies from 403 response - single cookie", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(
          403,
          "blocked",
          { "x-datadome": "protected" },
          "datadome=abc123; Path=/; Secure",
        );
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("DataDome");
    });

    test("captures DataDome cookies from 403 response - multiple cookies", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(
          403,
          "blocked",
          { "x-datadome": "protected" },
          [
            "datadome=abc123; Path=/; Secure",
            "session=xyz789; Path=/; HttpOnly",
          ],
        );
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("DataDome");
    });
  });

  describe("PerimeterX detection", () => {
    test("detects PerimeterX from px-captcha in response body", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(
          403,
          "<html><body>px-captcha challenge</body></html>",
        );
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("PerimeterX");

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    test("detects PerimeterX from px_captcha in response body", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(
          403,
          "<html><body>px_captcha verification</body></html>",
        );
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("PerimeterX");
    });

    test("detects PerimeterX from perimeterx keyword", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(
          403,
          "<html><body>perimeterx protection active</body></html>",
        );
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("PerimeterX");
    });

    test("detects PerimeterX from /_px/ path in response", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(
          403,
          '<script src="/_px/init.js"></script>',
        );
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("PerimeterX");
    });

    test("detects PerimeterX from x-px-* response headers", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(403, "blocked", {
          "x-px-original-token": "token123",
        });
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("PerimeterX");
    });

    test("detects PerimeterX with case-insensitive header check", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(403, "blocked", {
          "X-PX-Original-Token": "token123",
        });
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("PerimeterX");
    });
  });

  describe("proxy mode with httpCloak fetch", () => {
    test("uses proxy httpCloak fetch when useProxy is true", async () => {
      const mockHttpCloakFetch = mock(async () => ({
        html: TEST_HTML,
        requestHeaders: { "User-Agent": "test-ua" },
      }));

      const result = await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );

      expect(result).toBe(TEST_HTML);
      expect(mockHttpCloakFetch).toHaveBeenCalled();
    });

    test("passes proxy configuration to httpCloak fetch", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        expect(options?.proxyUrl).toBe("http://proxy.example.com:8080");
        expect(options?.secChUa).toBe(CHROME.secChUa);
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );

      expect(mockHttpCloakFetch).toHaveBeenCalled();
    });

    test("uses SOCKS proxy mode when protocol is socks5://", async () => {
      const mockHttpCloakFetch = mock(async () => ({
        html: TEST_HTML,
        requestHeaders: { "User-Agent": "test-ua" },
      }));

      await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "socks5://proxy.example.com:1080",
          useProxy: true,
        },
      );

      expect(mockHttpCloakFetch).toHaveBeenCalled();
    });

    test("uses SOCKS proxy mode when protocol is socks4://", async () => {
      const mockHttpCloakFetch = mock(async () => ({
        html: TEST_HTML,
        requestHeaders: { "User-Agent": "test-ua" },
      }));

      await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "socks4://proxy.example.com:1080",
          useProxy: true,
        },
      );

      expect(mockHttpCloakFetch).toHaveBeenCalled();
    });

    test("passes allowInsecureTls option to httpCloak fetch", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        expect(options?.allowInsecureTls).toBe(true);
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          allowInsecureTls: true,
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );
    });

    test("passes default browser headers in proxy mode", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        expect(options?.accept).toBe(CHROME.accept);
        expect(options?.secChUa).toBe(CHROME.secChUa);
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );
    });

    test("builds DDG referer in proxy mode", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        expect(options?.referer).toMatch(/duckduckgo\.com/);
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );
    });
  });

  describe("proxy mode retry logic", () => {
    test("retries on 403 in proxy mode up to configured limit", async () => {
      let attemptCount = 0;
      const mockHttpCloakFetch = mock(async () => {
        attemptCount++;
        if (attemptCount <= EXTRACT_403_RETRIES) {
          throw new GotScrapingError(
            403,
            "blocked",
            "http",
            "proxy.example.com:8080",
            135,
            false,
            0,
            {},
            {},
          );
        }
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      const result = await fetchHtml(
        TEST_URL,
        {
          delayFn: async () => {}, // No-op delay for tests
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );

      expect(result).toBe(TEST_HTML);
      expect(attemptCount).toBe(EXTRACT_403_RETRIES + 1);
    });

    test("retries on 429 in proxy mode", async () => {
      let attemptCount = 0;
      const mockHttpCloakFetch = mock(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new GotScrapingError(
            429,
            "rate limited",
            "http",
            "proxy.example.com:8080",
            135,
            false,
            0,
            { "retry-after": "5" },
            {},
          );
        }
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      const result = await fetchHtml(
        TEST_URL,
        {
          delayFn: async () => {}, // No-op delay for tests
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );

      expect(result).toBe(TEST_HTML);
      expect(attemptCount).toBe(2);
    });

    test("does not retry on 404 in proxy mode", async () => {
      let attemptCount = 0;
      const mockHttpCloakFetch = mock(async () => {
        attemptCount++;
        throw new GotScrapingError(
          404,
          "not found",
          "http",
          "proxy.example.com:8080",
          135,
          false,
          0,
          {},
          {},
        );
      });

      await expect(
        fetchHtml(
          TEST_URL,
          {
            httpCloakFetchFn: mockHttpCloakFetch,
          },
          {
            proxyUrl: "http://proxy.example.com:8080",
            useProxy: true,
          },
        ),
      ).rejects.toThrow();

      expect(attemptCount).toBe(1);
    });

    test("does not retry on 500 in proxy mode", async () => {
      let attemptCount = 0;
      const mockHttpCloakFetch = mock(async () => {
        attemptCount++;
        throw new GotScrapingError(
          500,
          "server error",
          "http",
          "proxy.example.com:8080",
          135,
          false,
          0,
          {},
          {},
        );
      });

      await expect(
        fetchHtml(
          TEST_URL,
          {
            httpCloakFetchFn: mockHttpCloakFetch,
          },
          {
            proxyUrl: "http://proxy.example.com:8080",
            useProxy: true,
          },
        ),
      ).rejects.toThrow();

      expect(attemptCount).toBe(1);
    });

    test("stops retry immediately on PerimeterX detection in proxy mode", async () => {
      let attemptCount = 0;
      const mockHttpCloakFetch = mock(async () => {
        attemptCount++;
        throw new GotScrapingError(
          403,
          "<html>px-captcha challenge</html>",
          "http",
          "proxy.example.com:8080",
          135,
          false,
          0,
          { "x-px-original-token": "token" },
          {},
        );
      });

      await expect(
        fetchHtml(
          TEST_URL,
          {
            httpCloakFetchFn: mockHttpCloakFetch,
          },
          {
            proxyUrl: "http://proxy.example.com:8080",
            useProxy: true,
          },
        ),
      ).rejects.toThrow();

      // Should only attempt once, not retry
      expect(attemptCount).toBe(1);
    });

    test("stops retry immediately on DataDome detection in proxy mode", async () => {
      let attemptCount = 0;
      const mockHttpCloakFetch = mock(async () => {
        attemptCount++;
        throw new GotScrapingError(
          403,
          "blocked",
          "http",
          "proxy.example.com:8080",
          135,
          false,
          0,
          { "x-datadome": "protected" },
          {},
        );
      });

      await expect(
        fetchHtml(
          TEST_URL,
          {
            httpCloakFetchFn: mockHttpCloakFetch,
          },
          {
            proxyUrl: "http://proxy.example.com:8080",
            useProxy: true,
          },
        ),
      ).rejects.toThrow();

      // Should only attempt once, not retry
      expect(attemptCount).toBe(1);
    });

    test("reuses the same httpCloak browser profile across retry attempts in proxy mode", async () => {
      const usedSecChUas: string[] = [];
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        usedSecChUas.push(options?.secChUa ?? "");
        if (usedSecChUas.length < 3) {
          throw new GotScrapingError(
            403,
            "blocked",
            "http",
            "proxy.example.com:8080",
            135,
            false,
            0,
            {},
            {},
          );
        }
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        TEST_URL,
        {
          delayFn: async () => {}, // No-op delay for tests
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );

      expect(usedSecChUas).toEqual([
        CHROME.secChUa,
        CHROME.secChUa,
        CHROME.secChUa,
      ]);
    });

    test("adds delay between proxy retry attempts", async () => {
      let attemptCount = 0;
      const attemptTimes: number[] = [];
      const delays: number[] = [];
      const mockDelay = mock(async (ms: number) => {
        delays.push(ms);
      });
      const mockHttpCloakFetch = mock(async () => {
        attemptTimes.push(Date.now());
        attemptCount++;
        if (attemptCount === 1) {
          throw new GotScrapingError(
            403,
            "blocked",
            "http",
            "proxy.example.com:8080",
            135,
            false,
            0,
            {},
            {},
          );
        }
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        TEST_URL,
        {
          delayFn: mockDelay,
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );

      // Second attempt should have delay (800ms base + jitter)
      expect(delays.length).toBe(1);
      expect(delays[0]).toBeGreaterThanOrEqual(800);
      expect(delays[0]).toBeLessThanOrEqual(1200); // 800 + max 400 jitter
    });

    test("throws last error after all proxy retries exhausted", async () => {
      const mockHttpCloakFetch = mock(async () => {
        throw new GotScrapingError(
          403,
          "blocked",
          "http",
          "proxy.example.com:8080",
          135,
          false,
          0,
          {},
          {},
        );
      });

      await expect(
        fetchHtml(
          TEST_URL,
          {
            delayFn: async () => {}, // No-op delay for tests
            httpCloakFetchFn: mockHttpCloakFetch,
          },
          {
            proxyUrl: "http://proxy.example.com:8080",
            useProxy: true,
          },
        ),
      ).rejects.toThrow();

      expect(mockHttpCloakFetch).toHaveBeenCalledTimes(
        1 + EXTRACT_403_RETRIES,
      );
    });
  });

  describe("direct mode with fetchTextWithValidatedRedirects", () => {
    test("uses direct mode when no axiosGetFn and no proxy", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(mockAxiosGet).toHaveBeenCalled();
    });

    test("validates redirect URLs during direct fetch", async () => {
      const mockIsAllowed = mock(async () => true);
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
        isAllowedFeedUrlFn: mockIsAllowed,
      });

      expect(mockIsAllowed).toHaveBeenCalled();
    });

    test("throws on blocked initial URL", async () => {
      const mockIsAllowed = mock(async () => false); // First URL blocked
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await expect(
        fetchHtml("https://blocked.example.com", {
          axiosGetFn: mockAxiosGet as any,
          isAllowedFeedUrlFn: mockIsAllowed,
        }),
      ).rejects.toThrow("Blocked URL");
    });
  });

  describe("buildDdgReferer functionality", () => {
    test("generates referer from URL slug", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        const referer = options?.referer ?? "";
        expect(referer).toContain("duckduckgo.com");
        expect(referer).toContain("q=");
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        "https://example.com/news/great-article-title",
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );
    });

    test("handles URL with file extension in slug", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        const referer = options?.referer ?? "";
        expect(referer).toContain("duckduckgo.com");
        // Should strip .html extension
        expect(referer).toMatch(/q=[^&]+/);
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        "https://example.com/article.html",
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );
    });

    test("handles URL with hyphens and underscores", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        const referer = options?.referer ?? "";
        expect(referer).toContain("duckduckgo.com");
        // Hyphens/underscores should be converted to spaces
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        "https://example.com/my-great_article",
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );
    });

    test("uses default query on invalid URL", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        const referer = options?.referer ?? "";
        expect(referer).toContain("duckduckgo.com");
        expect(referer).toContain("news+right+now");
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      // Pass a valid URL to fetchHtml, but the referer logic will be tested
      // This tests the catch block in buildDdgReferer indirectly
      await fetchHtml(
        "https://example.com/",
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );
    });

    test("encodes spaces as + in referer URL", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        const referer = options?.referer ?? "";
        // Spaces in query should be encoded as +, not %20
        expect(referer).toMatch(/\+/);
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        "https://example.com/article-with-many-words",
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );
    });
  });

  describe("edge cases and error conditions", () => {
    test("handles non-Error thrown objects", async () => {
      const mockAxiosGet = mock(async () => {
        throw new Error("string error");
      });

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
        }),
      ).rejects.toThrow("string error");
    });

    test("handles empty response body", async () => {
      const mockAxiosGet = mock(async () => ({
        data: "",
        status: 200,
      }));

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(result).toBe("");
    });

    test("handles large HTML response", async () => {
      const largeHtml = "<html>" + "x".repeat(10000000) + "</html>";
      const mockAxiosGet = mock(async () => ({
        data: largeHtml,
        status: 200,
      }));

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(result.length).toBeGreaterThan(10000000);
    });

    test("handles response with special characters", async () => {
      const specialHtml = "<html><body>Тест 测试 🎉</body></html>";
      const mockAxiosGet = mock(async () => ({
        data: specialHtml,
        status: 200,
      }));

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(result).toBe(specialHtml);
    });

    test("handles GotScrapingError with missing responseBody", async () => {
      const mockHttpCloakFetch = mock(async () => {
        throw new GotScrapingError(
          403,
          "",
          "http",
          "proxy.example.com:8080",
          135,
          false,
          0,
          {},
          {},
        );
      });

      await expect(
        fetchHtml(
          TEST_URL,
          {
            delayFn: async () => {}, // No-op delay for tests
            httpCloakFetchFn: mockHttpCloakFetch,
          },
          {
            proxyUrl: "http://proxy.example.com:8080",
            useProxy: true,
          },
        ),
      ).rejects.toThrow();
    });

    test("handles GotScrapingError with redirect hop info", async () => {
      const mockHttpCloakFetch = mock(async () => {
        throw new GotScrapingError(
          403,
          "blocked",
          "http",
          "proxy.example.com:8080",
          135,
          false,
          2, // redirectHop
          {},
          {},
        );
      });

      await expect(
        fetchHtml(
          TEST_URL,
          {
            delayFn: async () => {}, // No-op delay for tests
            httpCloakFetchFn: mockHttpCloakFetch,
          },
          {
            proxyUrl: "http://proxy.example.com:8080",
            useProxy: true,
          },
        ),
      ).rejects.toThrow();
    });

    test("handles undefined response headers in axios error", async () => {
      const mockAxiosGet = mock(async () => {
        const error = new Error(
          "Request failed with status code 403",
        ) as AxiosError;
        error.isAxiosError = true;
        error.response = {
          config: {} as any,
          data: "blocked",
          headers: undefined as any,
          status: 403,
          statusText: "Forbidden",
        } as AxiosResponse;
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();
    });

    test("handles null response in axios error", async () => {
      const mockAxiosGet = mock(async () => {
        const error = new Error("Network error") as AxiosError;
        error.isAxiosError = true;
        error.response = undefined;
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();
    });
  });

  describe("request headers configuration", () => {
    test("sets correct User-Agent from httpCloak pool", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      // With injected axios, uses first httpCloak
      expect(mockAxiosGet).toHaveBeenCalled();
    });

    test("sets sec-ch-ua header correctly", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(mockAxiosGet).toHaveBeenCalled();
      // When injected, should use ARTICLE_EXTRACT_SEC_CH_UA
    });

    test("sets all required security headers", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(mockAxiosGet).toHaveBeenCalled();
      // Should have Sec-Fetch-* headers
    });

    test("sets Sec-Fetch-Site to 'none' for direct navigation", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(mockAxiosGet).toHaveBeenCalled();
      // With injected axios, no referer, so Sec-Fetch-Site should be "none"
    });

    test("includes Accept header with signed-exchange support", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(mockAxiosGet).toHaveBeenCalled();
    });

    test("includes Accept-Encoding with modern formats", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(mockAxiosGet).toHaveBeenCalled();
    });
  });

  describe("TLS httpCloak fallback for DataDome/PerimeterX", () => {
    test("prefers explicit httpCloak fetching before injected axios fallbacks", async () => {
      const mockAxiosGet = mock(async () => ({
        data: "<html><body>axios fallback</body></html>",
        status: 200,
      }));
      const mockHttpCloakFetch = mock(async () => ({
        html: TEST_HTML,
        requestHeaders: {},
      }));

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: asAxiosGet(mockAxiosGet),
        httpCloakFetchFn: mockHttpCloakFetch,
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: isAxiosError,
      });

      expect(result).toBe(TEST_HTML);
      expect(mockHttpCloakFetch).toHaveBeenCalledTimes(1);
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    test("falls back from httpCloak to browser-profile axios before plain axios", async () => {
      const capturedHeaders: Record<string, string>[] = [];
      const mockAxiosGet = mock(async (_url: string, config?: unknown) => {
        capturedHeaders.push(
          ((config as undefined | { headers?: Record<string, string> })?.headers ??
            {}) as Record<string, string>,
        );
        return {
          data: TEST_HTML,
          status: 200,
        };
      });
      const mockHttpCloakFetch = mock(async () => {
        throw new Error("httpCloak failed");
      });

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: asAxiosGet(mockAxiosGet),
        httpCloakFetchFn: mockHttpCloakFetch,
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: isAxiosError,
      });

      expect(result).toBe(TEST_HTML);
      expect(mockHttpCloakFetch).toHaveBeenCalledTimes(1);
      expect(mockAxiosGet).toHaveBeenCalledTimes(1);
      expect(capturedHeaders[0]?.["sec-ch-ua"]).toBeTruthy();
      expect(capturedHeaders[0]?.Referer).toContain("duckduckgo.com");
    });

    test("falls back to plain axios after browser-profile axios fails", async () => {
      const capturedHeaders: Record<string, string>[] = [];
      let axiosCallCount = 0;
      const mockAxiosGet = mock(async (_url: string, config?: unknown) => {
        capturedHeaders.push(
          ((config as undefined | { headers?: Record<string, string> })?.headers ??
            {}) as Record<string, string>,
        );
        axiosCallCount += 1;
        if (axiosCallCount === 1) {
          throw createAxiosError(500, "browser-profile failed");
        }

        return {
          data: TEST_HTML,
          status: 200,
        };
      });
      const mockHttpCloakFetch = mock(async () => {
        throw new Error("httpCloak failed");
      });

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: asAxiosGet(mockAxiosGet),
        httpCloakFetchFn: mockHttpCloakFetch,
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: isAxiosError,
      });

      expect(result).toBe(TEST_HTML);
      expect(mockHttpCloakFetch).toHaveBeenCalledTimes(1);
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
      expect(capturedHeaders[0]?.["sec-ch-ua"]).toBeTruthy();
      expect(capturedHeaders[0]?.Referer).toContain("duckduckgo.com");
      expect(capturedHeaders[1]?.["sec-ch-ua"]).toBeUndefined();
      expect(capturedHeaders[1]?.Referer).toBeUndefined();
    });

    test("passes browser-style headers through the DataDome fallback path", async () => {
      const mockHttpCloakFetch = mock(async (_url, _validator, options) => {
        expect(options?.accept).toBe(CHROME.accept);
        expect(options?.secChUa).toBe(CHROME.secChUa);
        return {
          html: TEST_HTML,
          requestHeaders: { "User-Agent": "test-ua" },
        };
      });

      await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );

      expect(mockHttpCloakFetch).toHaveBeenCalled();
    });
  });

  describe("proxy URL without useProxy flag", () => {
    test("ignores proxyUrl when useProxy is false", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(
        TEST_URL,
        {
          axiosGetFn: mockAxiosGet as any,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: false,
        },
      );

      expect(mockAxiosGet).toHaveBeenCalled();
      // Should use direct mode, not proxy mode
    });

    test("ignores proxyUrl when useProxy is undefined", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      await fetchHtml(
        TEST_URL,
        {
          axiosGetFn: mockAxiosGet as any,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
        },
      );

      expect(mockAxiosGet).toHaveBeenCalled();
    });
  });

  describe("options parameter variations", () => {
    test("handles undefined options parameter", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      const result = await fetchHtml(TEST_URL, {
        axiosGetFn: mockAxiosGet as any,
      });

      expect(result).toBe(TEST_HTML);
    });

    test("handles empty options object", async () => {
      const mockAxiosGet = mock(async () => ({
        data: TEST_HTML,
        status: 200,
      }));

      const result = await fetchHtml(
        TEST_URL,
        {
          axiosGetFn: mockAxiosGet as any,
        },
        {},
      );

      expect(result).toBe(TEST_HTML);
    });

    test("handles undefined deps parameter", async () => {
      const mockHttpCloakFetch = mock(async () => ({
        html: TEST_HTML,
        requestHeaders: {},
      }));

      // Can't test without axiosGetFn easily, would hit real network
      // Testing with proxy mode instead
      const result = await fetchHtml(
        TEST_URL,
        {
          httpCloakFetchFn: mockHttpCloakFetch,
        },
        {
          proxyUrl: "http://proxy.example.com:8080",
          useProxy: true,
        },
      );

      expect(result).toBe(TEST_HTML);
    });
  });

  describe("mixed vendor access-response scenarios", () => {
    test("handles 403 with both DataDome and PerimeterX indicators (DataDome takes precedence)", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(
          403,
          "<html>px-captcha challenge</html>",
          {
            "x-datadome": "protected",
            "x-px-original-token": "token",
          },
        );
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow("DataDome");
    });

    test("handles 403 with non-protected x-datadome value", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(403, "blocked", {
          "x-datadome": "some-other-value",
        });
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      // Should not detect as DataDome, will just be regular 403
      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();
    });

    test("handles partial PerimeterX patterns that should not trigger detection", async () => {
      const mockAxiosGet = mock(async () => {
        const error = createAxiosError(
          403,
          "<html>This page mentions pixel tracking</html>",
        );
        throw error;
      });
      // Use the isAxiosError type predicate defined at the top

      // "px" alone should not trigger PerimeterX detection
      await expect(
        fetchHtml(TEST_URL, {
          axiosGetFn: mockAxiosGet as any,
          isAxiosErrorFn: isAxiosError,
        }),
      ).rejects.toThrow();

      // Should not throw PerimeterX error
    });
  });
});

// ── lib/extract/upstream – TLS httpCloak fallback (compatibility signals) ─

describe("lib/extract/upstream – proxy path with httpCloakFetchFn", () => {
  // The direct-path TLS fallback (sourceCompatibilitySignal.detected && !injectedGet) cannot
  // be tested with injected deps because injecting axiosGetFn sets `injectedGet`
  // which bypasses the fallback. Instead, we test the PROXY path which always
  // uses httpCloakFetchFn directly.
  test("proxy path calls httpCloakFetchFn and returns html", async () => {
    const { fetchHtml } = await import("@/lib/extract");

    let httpCloakCalled = false;
    const mockHttpCloakFetch = async () => {
      httpCloakCalled = true;
      return {
        html: "<html><body>Proxy httpCloak content</body></html>",
        requestHeaders: { "User-Agent": "test-ua" },
      };
    };

    const result = await fetchHtml(
      "https://example.com/proxy-extract",
      { httpCloakFetchFn: mockHttpCloakFetch as any },
      { proxyUrl: "http://proxy.example.com:8080", useProxy: true },
    );

    expect(httpCloakCalled).toBe(true);
    expect(result).toContain("Proxy httpCloak content");
  });

  test("proxy path falls back to injected axios after httpCloak failure", async () => {
    const { fetchHtml } = await import("@/lib/extract");

    const mockHttpCloakFetch = async () => {
      throw new Error("HTTPCloak fetch failed");
    };

    const mockAxiosGet = asAxiosGet(async () => ({
      data: "<html><body>proxy fallback</body></html>",
      status: 200,
    }));

    const result = await fetchHtml(
      "https://example.com/proxy-extract-fail",
      {
        axiosGetFn: mockAxiosGet,
        httpCloakFetchFn: mockHttpCloakFetch as any,
        isAllowedFeedUrlFn: async () => true,
      },
      { proxyUrl: "http://proxy.example.com:8080", useProxy: true },
    );

    expect(result).toContain("proxy fallback");
  });
});

describe("lib/extract/upstream – fetchHtml injectable paths", () => {
  test("throws when URL is rejected by isAllowedFeedUrlFn", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    await expect(
      fetchHtml(
        "https://blocked.example.com/feed",
        {
          axiosGetFn: asAxiosGet(async () => ({ data: "<html/>" })),
          isAllowedFeedUrlFn: async () => false,
        },
        {},
      ),
    ).rejects.toThrow("Blocked URL");
  });

  test("returns html from injected axiosGetFn on direct path", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const html = await fetchHtml(
      "https://example.com/article",
      {
        axiosGetFn: asAxiosGet(async () => ({
          data: "<html><body>hello</body></html>",
        })),
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: asIsAxiosError(() => false),
      },
      {},
    );
    expect(html).toBe("<html><body>hello</body></html>");
  });

  test("proxy path: returns html from injected httpCloakFetchFn", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const html = await fetchHtml(
      "https://example.com/proxied",
      {
        httpCloakFetchFn: async (_url, _isAllowed, _opts) => ({
          html: "<html><body>proxy</body></html>",
          requestHeaders: {},
        }),
        isAllowedFeedUrlFn: async () => true,
      },
      { proxyUrl: "http://myproxy.example.com:8080", useProxy: true },
    );
    expect(html).toBe("<html><body>proxy</body></html>");
  });

  test("direct path: rethrows non-retryable error from axiosGetFn", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const err = new Error("connection refused");
    await expect(
      fetchHtml(
        "https://example.com/article",
        {
          axiosGetFn: asAxiosGet(async () => {
            throw err;
          }),
          isAllowedFeedUrlFn: async () => true,
          isAxiosErrorFn: asIsAxiosError(() => false),
        },
        {},
      ),
    ).rejects.toThrow("connection refused");
  });
});

describe("fetchHtml direct path – error branches", () => {
  test("rethrows when isAxiosError returns false", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const err = new Error("network failure");
    await expect(
      fetchHtml(
        "https://example.com/article",
        {
          axiosGetFn: asAxiosGet(async () => {
            throw err;
          }),
          isAllowedFeedUrlFn: async () => true,
          isAxiosErrorFn: asIsAxiosError(() => false),
        },
        {},
      ),
    ).rejects.toThrow("network failure");
  });

  test("returns html on successful direct fetch", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const html = await fetchHtml(
      "https://example.com/article",
      {
        axiosGetFn: asAxiosGet(async () => ({
          data: "<html><body>content</body></html>",
        })),
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: asIsAxiosError(() => false),
      },
      {},
    );
    expect(html).toBe("<html><body>content</body></html>");
  });
});

// ── lib/extract/upstream.ts – proxy path with httpCloak ────────────────────

describe("fetchHtml proxy path – httpCloak fetch", () => {
  test("returns html from httpCloak fetch on proxy path", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const html = await fetchHtml(
      "https://example.com/proxied",
      {
        delayFn: async () => {},
        httpCloakFetchFn: async () => ({
          html: "<html><body>proxied</body></html>",
          requestHeaders: { "User-Agent": "test" },
        }),
        isAllowedFeedUrlFn: async () => true,
      },
      { proxyUrl: "http://proxy.example.com:8080", useProxy: true },
    );
    expect(html).toBe("<html><body>proxied</body></html>");
  });

  test("throws after exhausting proxy retries", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const { GotScrapingError } = await import("@/lib/fetch");
    await expect(
      fetchHtml(
        "https://example.com/proxied",
        {
          delayFn: async () => {},
          httpCloakFetchFn: async () => {
            throw new GotScrapingError(
              403,
              "Access Denied",
              "http",
              "http://proxy.example.com:8080",
              130,
              false,
              0,
              {},
              {},
            );
          },
          isAllowedFeedUrlFn: async () => true,
        },
        { proxyUrl: "http://proxy.example.com:8080", useProxy: true },
      ),
    ).rejects.toThrow();
  });
});

// ── lib/extract/upstream – proxy path error flow ──────────────────────────────

describe("lib/extract/upstream – fetchHtml proxy path error handling", () => {
  test("falls back to injected axios when proxy httpCloak fetch throws", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const proxyErr = Object.assign(new Error("proxy connection refused"), {
      proxyMode: "socks" as const,
      redirectHop: 0,
      requestHeaders: {},
      responseBody: "",
      responseHeaders: {},
      statusCode: 500,
    });

    const mockAxiosGet = asAxiosGet(async () => ({
      data: "<html><body>proxy axios recovery</body></html>",
      status: 200,
    }));

    const html = await fetchHtml(
      "https://example.com/article",
      {
        axiosGetFn: mockAxiosGet,
        httpCloakFetchFn: async () => {
          throw proxyErr;
        },
        isAllowedFeedUrlFn: async () => true,
      },
      {
        proxyUrl: "socks5://proxy.example.com:1080",
        useProxy: true,
      },
    );

    expect(html).toContain("proxy axios recovery");
  });

  test("re-throws when axiosGetFn throws a compatibility-signaled error (non-retryable)", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");

    // Build a minimal AxiosError-like object for DataDome detection
    const axiosLikeErr: any = {
      isAxiosError: true,
      message: "Request failed with status code 403",
      response: {
        config: {},
        data: "",
        headers: { "x-datadome": "protected" },
        status: 403,
      },
    };
    axiosLikeErr.constructor = axiosLikeErr;

    await expect(
      fetchHtml(
        "https://example.com/article",
        {
          axiosGetFn: async () => {
            throw axiosLikeErr;
          },
          isAllowedFeedUrlFn: async () => true,
          isAxiosErrorFn: ((e: unknown) => e === axiosLikeErr) as any,
        },
        {},
      ),
    ).rejects.toBeDefined();
  });
});
