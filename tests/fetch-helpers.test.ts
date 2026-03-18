import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as zlib from "node:zlib";

import {
  addCookiesToHeaders,
  generateBrowserHeaders,
  storeCookiesFromResponse,
} from "@/lib/fetch/cookies";
import { buildDdgReferer } from "@/lib/fetch/referer";
import {
  decompressBody,
  GotScrapingError,
  pickDiagnosticHeaders,
} from "@/lib/fetch/response";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("fetch/cookies", () => {
  test("addCookiesToHeaders copies cookie strings from the jar and tolerates failures", () => {
    const headers: Record<string, string> = {};
    const cookieJar = {
      getCookieStringSync: () => "session=abc; theme=dark",
    };

    addCookiesToHeaders(headers, cookieJar as never, "https://example.com");
    expect(headers.Cookie).toBe("session=abc; theme=dark");

    addCookiesToHeaders(headers, undefined, "https://example.com");
    expect(headers.Cookie).toBe("session=abc; theme=dark");

    addCookiesToHeaders(
      headers,
      {
        getCookieStringSync: () => {
          throw new Error("cookie failure");
        },
      } as never,
      "https://example.com",
    );
    expect(headers.Cookie).toBe("session=abc; theme=dark");
  });

  test("generateBrowserHeaders applies defaults and referer overrides", () => {
    const defaultHeaders = generateBrowserHeaders("2");
    expect(defaultHeaders.Accept).toBeTruthy();
    expect(defaultHeaders["Sec-Fetch-Site"]).toBe("none");
    expect(defaultHeaders.Referer).toBeUndefined();

    const overriddenHeaders = generateBrowserHeaders("2", {
      accept: "text/html",
      referer: "https://ref.example.com/article",
      secChUa: '"Chromium";v="131"',
    });
    expect(overriddenHeaders.Accept).toBe("text/html");
    expect(overriddenHeaders.Referer).toBe("https://ref.example.com/article");
    expect(overriddenHeaders["Sec-Ch-Ua"]).toBe('"Chromium";v="131"');
    expect(overriddenHeaders["Sec-Fetch-Site"]).toBe("cross-site");
  });

  test("storeCookiesFromResponse accepts string and array set-cookie headers and skips malformed cookies", () => {
    const calls: string[] = [];
    const cookieJar = {
      setCookieSync: (value: string) => {
        calls.push(value);
        if (value.includes("broken")) {
          throw new Error("invalid cookie");
        }
      },
    };

    storeCookiesFromResponse(
      cookieJar as never,
      { "set-cookie": "session=abc; Path=/" },
      "https://example.com",
    );
    storeCookiesFromResponse(
      cookieJar as never,
      {
        "set-cookie": [
          "theme=dark; Path=/",
          "broken-cookie",
          "layout=grid; Path=/",
        ],
      },
      "https://example.com",
    );
    storeCookiesFromResponse(undefined, {}, "https://example.com");

    expect(calls).toEqual([
      "session=abc; Path=/",
      "theme=dark; Path=/",
      "broken-cookie",
      "layout=grid; Path=/",
    ]);
  });
});

describe("fetch/response", () => {
  test("GotScrapingError exposes the upstream context fields", () => {
    const error = new GotScrapingError(
      403,
      "blocked",
      "proxy",
      "socks5://proxy.example.com:1080",
      131,
      true,
      2,
      { server: "cloudflare" },
      { Accept: "text/html" },
    );

    expect(error.message).toBe("Upstream responded with status 403");
    expect(error.statusCode).toBe(403);
    expect(error.responseBody).toBe("blocked");
    expect(error.proxyMode).toBe("proxy");
    expect(error.proxyAddress).toContain("proxy.example.com");
    expect(error.browserVersion).toBe(131);
    expect(error.allowInsecureTls).toBe(true);
    expect(error.redirectHop).toBe(2);
  });

  test("decompressBody handles plain, gzip, deflate, brotli, and zstd-compatible inputs", async () => {
    const body = Buffer.from("hello world", "utf8");

    await expect(decompressBody(body, "identity")).resolves.toBe("hello world");
    await expect(decompressBody(zlib.gzipSync(body), "gzip")).resolves.toBe(
      "hello world",
    );
    await expect(decompressBody(zlib.gzipSync(body), "x-gzip")).resolves.toBe(
      "hello world",
    );
    await expect(
      decompressBody(zlib.deflateSync(body), "deflate"),
    ).resolves.toBe("hello world");
    await expect(
      decompressBody(zlib.brotliCompressSync(body), "br"),
    ).resolves.toBe("hello world");

    const zstdModule = zlib as typeof zlib & {
      zstdCompressSync?: (buffer: Buffer) => Buffer;
    };
    if (typeof zstdModule.zstdCompressSync === "function") {
      await expect(
        decompressBody(zstdModule.zstdCompressSync(body), "zstd"),
      ).resolves.toBe("hello world");
    } else {
      await expect(decompressBody(body, "zstd")).resolves.toBe("hello world");
    }
  });

  test("pickDiagnosticHeaders keeps selected headers and counts set-cookie values", () => {
    expect(
      pickDiagnosticHeaders({
        "cf-ray": "abc123",
        ignored: "nope",
        server: "cloudflare",
        "set-cookie": ["a=1", "b=2"],
        "x-px-test": "1",
      }),
    ).toEqual({
      "cf-ray": "abc123",
      server: "cloudflare",
      "set-cookie-count": 2,
      "x-px-test": "1",
    });
  });
});

describe("fetch/referer", () => {
  test("buildDdgReferer derives a readable query from the article slug and falls back on invalid URLs", () => {
    expect(
      buildDdgReferer(
        "https://example.com/news/space-launch-window-opens.html",
      ),
    ).toBe("https://duckduckgo.com/?q=space+launch+window+opens&ia=web");
    expect(buildDdgReferer("not a url")).toBe(
      "https://duckduckgo.com/?q=news+right+now&ia=web",
    );
  });
});
