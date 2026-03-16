import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as zlib from "zlib";

import {
  decompressBody,
  extractionAxios,
  fetchHtmlWithFingerprint,
  generateBrowserHeaders,
  GotScrapingError,
  parseSocksProxy,
  pickDiagnosticHeaders,
} from "@/lib/fetch";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("decompressBody", () => {
  test("handles brotli compression", async () => {
    const input = "test content";
    const compressed = zlib.brotliCompressSync(Buffer.from(input));
    const result = await decompressBody(compressed, "br");
    expect(result).toBe(input);
  });

  test("handles gzip compression", async () => {
    const input = "test content";
    const compressed = zlib.gzipSync(Buffer.from(input));
    const result = await decompressBody(compressed, "gzip");
    expect(result).toBe(input);
  });

  test("handles x-gzip compression", async () => {
    const input = "test content";
    const compressed = zlib.gzipSync(Buffer.from(input));
    const result = await decompressBody(compressed, "x-gzip");
    expect(result).toBe(input);
  });

  test("handles deflate compression", async () => {
    const input = "test content";
    const compressed = zlib.deflateSync(Buffer.from(input));
    const result = await decompressBody(compressed, "deflate");
    expect(result).toBe(input);
  });

  test("handles zstd compression when available", async () => {
    const input = "test content";
    const zstdCompress = (zlib as Record<string, unknown>).zstdCompress as
      | typeof zlib.brotliCompress
      | undefined;

    if (zstdCompress) {
      const compressed = await new Promise<Buffer>((resolve, reject) => {
        zstdCompress(Buffer.from(input), (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      const result = await decompressBody(compressed, "zstd");
      expect(result).toBe(input);
    } else {
      const result = await decompressBody(Buffer.from(input), "zstd");
      expect(result).toBe(input);
    }
  });

  test("returns uncompressed content when encoding is unrecognized", async () => {
    const input = "plain text";
    const result = await decompressBody(Buffer.from(input), "identity");
    expect(result).toBe(input);
  });

  test("returns uncompressed content when encoding is empty", async () => {
    const input = "plain text";
    const result = await decompressBody(Buffer.from(input), "");
    expect(result).toBe(input);
  });

  test("handles unicode characters correctly", async () => {
    const input = "测试内容 🎉";
    const compressed = zlib.gzipSync(Buffer.from(input, "utf8"));
    const result = await decompressBody(compressed, "gzip");
    expect(result).toBe(input);
  });

  test("throws error on corrupted brotli data", async () => {
    const corrupted = Buffer.from("not brotli data");
    await expect(decompressBody(corrupted, "br")).rejects.toThrow();
  });

  test("throws error on corrupted gzip data", async () => {
    const corrupted = Buffer.from("not gzip data");
    await expect(decompressBody(corrupted, "gzip")).rejects.toThrow();
  });
});

describe("parseSocksProxy", () => {
  test("parses socks5 proxy with all components", () => {
    const result = parseSocksProxy("socks5://user:pass@proxy.local:9050");
    expect(result.type).toBe(5);
    expect(result.host).toBe("proxy.local");
    expect(result.port).toBe(9050);
    expect(result.userId).toBe("user");
    expect(result.password).toBe("pass");
  });

  test("parses socks4 proxy", () => {
    const result = parseSocksProxy("socks4://proxy.local:1080");
    expect(result.type).toBe(4);
    expect(result.host).toBe("proxy.local");
    expect(result.port).toBe(1080);
    expect(result.userId).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  test("uses default port 1080 when not specified", () => {
    const result = parseSocksProxy("socks5://proxy.local");
    expect(result.port).toBe(1080);
  });

  test("parses socks5 proxy without auth", () => {
    const result = parseSocksProxy("socks5://proxy.local:8080");
    expect(result.type).toBe(5);
    expect(result.host).toBe("proxy.local");
    expect(result.port).toBe(8080);
    expect(result.userId).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  test("parses socks4 proxy with custom port", () => {
    const result = parseSocksProxy("socks4://10.0.0.1:3128");
    expect(result.type).toBe(4);
    expect(result.host).toBe("10.0.0.1");
    expect(result.port).toBe(3128);
  });

  test("decodes URL-encoded username", () => {
    const result = parseSocksProxy(
      "socks5://user%40name:pass@proxy.local:9050",
    );
    expect(result.userId).toBe("user@name");
  });

  test("decodes URL-encoded password", () => {
    const result = parseSocksProxy(
      "socks5://user:p%40ss%23word@proxy.local:9050",
    );
    expect(result.password).toBe("p@ss#word");
  });

  test("handles IPV6 addresses", () => {
    const result = parseSocksProxy("socks5://[::1]:1080");
    expect(result.host).toBe("[::1]");
    expect(result.port).toBe(1080);
  });

  test("parses proxy with only username", () => {
    const result = parseSocksProxy("socks5://user@proxy.local:1080");
    expect(result.userId).toBe("user");
    expect(result.password).toBeUndefined();
  });
});

describe("pickDiagnosticHeaders", () => {
  test("extracts standard diagnostic headers", () => {
    const headers = {
      "cf-ray": "12345",
      "content-type": "text/html",
      "retry-after": "120",
      server: "nginx",
      via: "1.1 proxy",
      "x-cache": "HIT",
      "x-datadome": "token",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result.server).toBe("nginx");
    expect(result.via).toBe("1.1 proxy");
    expect(result["x-cache"]).toBe("HIT");
    expect(result["content-type"]).toBe("text/html");
    expect(result["cf-ray"]).toBe("12345");
    expect(result["x-datadome"]).toBe("token");
    expect(result["retry-after"]).toBe("120");
  });

  test("extracts x-px- prefixed headers", () => {
    const headers = {
      other: "value",
      "x-px-score": "0",
      "x-px-uuid": "abc123",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result["x-px-uuid"]).toBe("abc123");
    expect(result["x-px-score"]).toBe("0");
    expect(result.other).toBeUndefined();
  });

  test("counts set-cookie headers when present as string", () => {
    const headers = {
      "set-cookie": "session=abc",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result["set-cookie-count"]).toBe(1);
  });

  test("counts set-cookie headers when present as array", () => {
    const headers = {
      "set-cookie": ["session=abc", "token=xyz", "pref=dark"],
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result["set-cookie-count"]).toBe(3);
  });

  test("omits set-cookie-count when no cookies", () => {
    const headers = {
      server: "nginx",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result["set-cookie-count"]).toBeUndefined();
  });

  test("filters out non-diagnostic headers", () => {
    const headers = {
      authorization: "Bearer token",
      cookie: "session=xyz",
      server: "nginx",
      "x-api-key": "secret",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result.authorization).toBeUndefined();
    expect(result.cookie).toBeUndefined();
    expect(result["x-api-key"]).toBeUndefined();
    expect(result.server).toBe("nginx");
  });

  test("handles empty headers object", () => {
    const result = pickDiagnosticHeaders({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("normalizes header keys to lowercase", () => {
    const headers = {
      "Content-Type": "text/html",
      Server: "nginx",
      "X-CACHE": "HIT",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result.server).toBe("nginx");
    expect(result["x-cache"]).toBe("HIT");
    expect(result["content-type"]).toBe("text/html");
  });

  test("includes all x-px- variants", () => {
    const headers = {
      "x-px-captcha": "captcha",
      "x-px-cookie": "cookie",
      "x-px-token": "token",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result["x-px-cookie"]).toBe("cookie");
    expect(result["x-px-captcha"]).toBe("captcha");
    expect(result["x-px-token"]).toBe("token");
  });
});

describe("GotScrapingError", () => {
  test("constructs with all required context", () => {
    const error = new GotScrapingError(
      403,
      "Forbidden",
      "socks",
      "socks5://proxy.local:1080",
      131,
      false,
      0,
      { server: "nginx" },
      { "user-agent": "Chrome/131" },
    );

    expect(error.statusCode).toBe(403);
    expect(error.responseBody).toBe("Forbidden");
    expect(error.proxyMode).toBe("socks");
    expect(error.proxyAddress).toBe("socks5://proxy.local:1080");
    expect(error.browserVersion).toBe(131);
    expect(error.allowInsecureTls).toBe(false);
    expect(error.redirectHop).toBe(0);
    expect(error.responseHeaders).toEqual({ server: "nginx" });
    expect(error.requestHeaders).toEqual({ "user-agent": "Chrome/131" });
    expect(error.message).toBe("Upstream responded with status 403");
  });

  test("handles null proxy address", () => {
    const error = new GotScrapingError(
      500,
      "Error",
      "direct",
      null,
      135,
      true,
      2,
      {},
      {},
    );

    expect(error.proxyMode).toBe("direct");
    expect(error.proxyAddress).toBeNull();
  });

  test("preserves redirect hop count", () => {
    const error = new GotScrapingError(
      404,
      "Not Found",
      "http",
      "http://proxy:8080",
      135,
      false,
      3,
      {},
      {},
    );

    expect(error.redirectHop).toBe(3);
  });

  test("is an instance of Error", () => {
    const error = new GotScrapingError(
      400,
      "Bad Request",
      "direct",
      null,
      131,
      false,
      0,
      {},
      {},
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("Error");
  });
});

describe("generateBrowserHeaders", () => {
  test("generates headers for HTTP/2", () => {
    const headers = generateBrowserHeaders("2");
    expect(headers).toBeDefined();
    expect(headers["User-Agent"]).toContain("Chrome");
    expect(headers["Accept"]).toBeDefined();
    expect(headers["Accept-Language"]).toBe("en-US,en;q=0.9");
    expect(headers["Accept-Encoding"]).toBe("gzip, deflate, br, zstd");
  });

  test("generates headers for HTTP/1.1", () => {
    const headers = generateBrowserHeaders("1");
    expect(headers).toBeDefined();
    expect(headers["User-Agent"]).toContain("Chrome");
    expect(headers["Accept-Language"]).toBe("en-US,en;q=0.9");
  });

  test("uses Chrome 131 static configuration", () => {
    const headers = generateBrowserHeaders("2");
    expect(headers["User-Agent"]).toContain("Chrome/131");
    expect(headers["Sec-Ch-Ua-Platform"]).toBe('"Windows"');
  });

  test("uses custom accept when provided", () => {
    const customAccept = "text/html,application/xhtml+xml";
    const headers = generateBrowserHeaders("2", { accept: customAccept });
    expect(headers["Accept"]).toBe(customAccept);
  });

  test("includes referer and sets sec-fetch-site to cross-site when referer provided", () => {
    const referer = "https://example.com/page";
    const headers = generateBrowserHeaders("2", { referer });
    expect(headers["Referer"]).toBe(referer);
    expect(headers["Sec-Fetch-Site"]).toBe("cross-site");
  });

  test("sets sec-fetch-site to none when no referer provided", () => {
    const headers = generateBrowserHeaders("2");
    expect(headers["Sec-Fetch-Site"]).toBe("none");
    expect(headers["Referer"]).toBeUndefined();
  });

  test("strips pseudo-headers starting with colon", () => {
    const headers = generateBrowserHeaders("2");
    const pseudoHeaders = Object.keys(headers).filter((k) => k.startsWith(":"));
    expect(pseudoHeaders).toHaveLength(0);
  });

  test("includes priority header", () => {
    const headers = generateBrowserHeaders("2");
    expect(headers["priority"]).toBe("u=0, i");
  });

  test("uses proper casing for Chrome 131 headers", () => {
    const headers = generateBrowserHeaders("2");
    // Verify proper casing per Chrome 131 spec
    expect(headers["Cache-Control"]).toBeDefined();
    expect(headers["Sec-Ch-Ua"]).toBeDefined();
    expect(headers["User-Agent"]).toBeDefined();
    expect(headers["Accept"]).toBeDefined();
    // Verify lowercase keys do NOT exist
    expect(headers["cache-control"]).toBeUndefined();
    expect(headers["user-agent"]).toBeUndefined();
  });

  test("orders headers in Chrome canonical order", () => {
    const headers = generateBrowserHeaders("2", {
      referer: "https://example.com",
    });
    const keys = Object.keys(headers);
    const expectedOrder = [
      "Cache-Control",
      "Sec-Ch-Ua",
      "Sec-Ch-Ua-Mobile",
      "Sec-Ch-Ua-Platform",
      "Upgrade-Insecure-Requests",
      "User-Agent",
      "Accept",
      "Sec-Fetch-Site",
      "Sec-Fetch-Mode",
      "Sec-Fetch-User",
      "Sec-Fetch-Dest",
      "Referer",
      "Accept-Encoding",
      "Accept-Language",
      "priority",
    ];

    const relevantKeys = keys.filter((k) => expectedOrder.includes(k));
    const expectedRelevant = expectedOrder.filter((k) => keys.includes(k));

    expect(relevantKeys).toEqual(expectedRelevant);
  });

  test("sanitizes user-agent to remove extension tokens", () => {
    const headers = generateBrowserHeaders("2");
    const ua = headers["User-Agent"] ?? "";
    expect(ua).not.toContain("SiderAI");
    expect(ua).not.toContain("Brave");
    expect(ua).not.toContain("Opera");
  });

  test("includes standard sec-fetch headers", () => {
    const headers = generateBrowserHeaders("2");
    expect(headers["Sec-Fetch-Mode"]).toBeDefined();
    expect(headers["Sec-Fetch-Dest"]).toBeDefined();
  });
});

describe("extractionAxios", () => {
  test("is an axios instance", () => {
    expect(extractionAxios).toBeDefined();
    expect(typeof extractionAxios.get).toBe("function");
    expect(typeof extractionAxios.post).toBe("function");
  });

  test("has default axios methods", () => {
    expect(extractionAxios.defaults).toBeDefined();
    expect(extractionAxios.interceptors).toBeDefined();
  });
});

describe("fetchHtmlWithFingerprint", () => {
  test("rejects blocked URLs immediately", async () => {
    const isAllowedUrl = async () => false;
    await expect(
      fetchHtmlWithFingerprint("https://blocked.com", isAllowedUrl),
    ).rejects.toThrow("Blocked URL");
  });

  test("follows redirects up to 5 times", async () => {
    let redirectCount = 0;
    const isAllowedUrl = async () => true;
    const requestFn = async () => {
      if (redirectCount < 3) {
        redirectCount++;
        return {
          body: "",
          headers: { location: `https://example.com/redirect${redirectCount}` },
          statusCode: 302,
        };
      }
      return {
        body: "<html>Final content</html>",
        headers: {},
        statusCode: 200,
      };
    };

    const result = await fetchHtmlWithFingerprint(
      "https://example.com/start",
      isAllowedUrl,
      {},
      { requestFn },
    );

    expect(result.html).toBe("<html>Final content</html>");
    expect(redirectCount).toBe(3);
  });

  test("throws error when exceeding redirect limit", async () => {
    const isAllowedUrl = async () => true;
    const requestFn = async () => ({
      body: "",
      headers: { location: "https://example.com/loop" },
      statusCode: 302,
    });

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/start",
        isAllowedUrl,
        {},
        { requestFn },
      ),
    ).rejects.toThrow("Too many redirects");
  });

  test("blocks redirect targets that fail URL validation", async () => {
    let callCount = 0;
    const isAllowedUrl = async (url: string) => {
      callCount++;
      return !url.includes("blocked");
    };
    const requestFn = async () => ({
      body: "",
      headers: { location: "https://blocked.com/page" },
      statusCode: 302,
    });

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/start",
        isAllowedUrl,
        {},
        { requestFn },
      ),
    ).rejects.toThrow("Blocked redirect target");

    expect(callCount).toBe(2);
  });

  test("throws error on redirect without location header", async () => {
    const isAllowedUrl = async () => true;
    const requestFn = async () => ({
      body: "",
      headers: {},
      statusCode: 302,
    });

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com",
        isAllowedUrl,
        {},
        { requestFn },
      ),
    ).rejects.toThrow("Redirect without Location header");
  });

  test("throws error on redirect with empty location header", async () => {
    const isAllowedUrl = async () => true;
    const requestFn = async () => ({
      body: "",
      headers: { location: "   " },
      statusCode: 302,
    });

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com",
        isAllowedUrl,
        {},
        { requestFn },
      ),
    ).rejects.toThrow("Redirect without Location header");
  });

  test("throws GotScrapingError on non-2xx status", async () => {
    const isAllowedUrl = async () => true;
    const requestFn = async () => ({
      body: "Forbidden",
      headers: { server: "nginx" },
      statusCode: 403,
    });

    try {
      await fetchHtmlWithFingerprint(
        "https://example.com",
        isAllowedUrl,
        {},
        { requestFn },
      );
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GotScrapingError);
      if (err instanceof GotScrapingError) {
        expect(err.statusCode).toBe(403);
        expect(err.responseBody).toBe("Forbidden");
      }
    }
  });

  test("throws error when response exceeds size limit", async () => {
    const isAllowedUrl = async () => true;
    const largeBody = "a".repeat(10_000_000);
    const requestFn = async () => ({
      body: largeBody,
      headers: {},
      statusCode: 200,
    });

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com",
        isAllowedUrl,
        {},
        { requestFn },
      ),
    ).rejects.toThrow("Upstream response too large");
  });

  test("returns successful response with request headers", async () => {
    const isAllowedUrl = async () => true;
    const requestFn = async () => ({
      body: "<html>Content</html>",
      headers: { "content-type": "text/html" },
      statusCode: 200,
    });

    const result = await fetchHtmlWithFingerprint(
      "https://example.com",
      isAllowedUrl,
      {},
      { requestFn },
    );

    expect(result.html).toBe("<html>Content</html>");
    expect(result.requestHeaders).toBeDefined();
    expect(result.requestHeaders["User-Agent"]).toBeDefined();
  });

  test("handles browser version option", async () => {
    const isAllowedUrl = async () => true;
    const requestFn = async (_url: URL, headers: Record<string, string>) => {
      expect(headers["User-Agent"]).toContain("Chrome/131");
      return {
        body: "<html>Content</html>",
        headers: {},
        statusCode: 200,
      };
    };

    await fetchHtmlWithFingerprint(
      "https://example.com",
      isAllowedUrl,
      {},
      { requestFn },
    );
  });

  test("resolves relative redirect locations", async () => {
    const isAllowedUrl = async () => true;
    let redirectHandled = false;
    const requestFn = async (url: URL) => {
      if (!redirectHandled) {
        redirectHandled = true;
        return {
          body: "",
          headers: { location: "/redirected" },
          statusCode: 302,
        };
      }
      expect(url.pathname).toBe("/redirected");
      return {
        body: "<html>Redirected</html>",
        headers: {},
        statusCode: 200,
      };
    };

    const result = await fetchHtmlWithFingerprint(
      "https://example.com/start",
      isAllowedUrl,
      {},
      { requestFn },
    );

    expect(result.html).toBe("<html>Redirected</html>");
  });

  test("strips URL fragments during redirect resolution", async () => {
    const isAllowedUrl = async () => true;
    let redirectHandled = false;
    const requestFn = async (url: URL) => {
      if (!redirectHandled) {
        redirectHandled = true;
        return {
          body: "",
          headers: { location: "https://example.com/page#section" },
          statusCode: 302,
        };
      }
      expect(url.hash).toBe("");
      return {
        body: "<html>Content</html>",
        headers: {},
        statusCode: 200,
      };
    };

    await fetchHtmlWithFingerprint(
      "https://example.com/start#intro",
      isAllowedUrl,
      {},
      { requestFn },
    );
  });

  test("handles array location header", async () => {
    const isAllowedUrl = async () => true;
    let redirectHandled = false;
    const requestFn = async () => {
      if (!redirectHandled) {
        redirectHandled = true;
        return {
          body: "",
          headers: { location: ["https://example.com/redirected"] },
          statusCode: 302,
        };
      }
      return {
        body: "<html>Redirected</html>",
        headers: {},
        statusCode: 200,
      };
    };

    const result = await fetchHtmlWithFingerprint(
      "https://example.com/start",
      isAllowedUrl,
      {},
      { requestFn },
    );

    expect(result.html).toBe("<html>Redirected</html>");
  });
});

describe("integration: generateBrowserHeaders edge cases", () => {
  test("uses Windows platform by default", () => {
    const headers = generateBrowserHeaders("2");
    expect(headers["Sec-Ch-Ua-Platform"]).toBe('"Windows"');
  });

  test("does not include cookies by default", () => {
    const headers = generateBrowserHeaders("2");
    expect(headers["Cookie"]).toBeUndefined();
  });

  test("maintains header order consistency across calls", () => {
    const headers1 = generateBrowserHeaders("2", {
      referer: "https://example.com",
    });
    const headers2 = generateBrowserHeaders("2", {
      referer: "https://example.com",
    });

    const keys1 = Object.keys(headers1);
    const keys2 = Object.keys(headers2);

    expect(keys1).toEqual(keys2);
  });

  test("generates headers for both HTTP/1.1 and HTTP/2 without errors", () => {
    const h1 = generateBrowserHeaders("1");
    const h2 = generateBrowserHeaders("2");

    expect(h1["User-Agent"]).toBeDefined();
    expect(h2["User-Agent"]).toBeDefined();
    expect(h1["Accept-Language"]).toBe("en-US,en;q=0.9");
    expect(h2["Accept-Language"]).toBe("en-US,en;q=0.9");
  });
});

describe("compression edge cases", () => {
  test("handles empty buffer with brotli", async () => {
    const compressed = zlib.brotliCompressSync(Buffer.from(""));
    const result = await decompressBody(compressed, "br");
    expect(result).toBe("");
  });

  test("handles empty buffer with gzip", async () => {
    const compressed = zlib.gzipSync(Buffer.from(""));
    const result = await decompressBody(compressed, "gzip");
    expect(result).toBe("");
  });

  test("handles large content with compression", async () => {
    const largeContent = "test ".repeat(10000);
    const compressed = zlib.gzipSync(Buffer.from(largeContent));
    const result = await decompressBody(compressed, "gzip");
    expect(result).toBe(largeContent);
  });

  test("handles mixed encodings by treating as uncompressed", async () => {
    const input = "plain text";
    const result = await decompressBody(Buffer.from(input), "gzip, deflate");
    expect(result).toBe(input);
  });
});

describe("parseSocksProxy edge cases", () => {
  test("handles proxy URL with empty username and password", () => {
    const result = parseSocksProxy("socks5://@proxy.local:1080");
    expect(result.userId).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  test("handles very long port numbers", () => {
    const result = parseSocksProxy("socks5://proxy.local:65535");
    expect(result.port).toBe(65535);
  });

  test("handles proxy with special characters in hostname", () => {
    const result = parseSocksProxy("socks5://proxy-server_1.example.com:1080");
    expect(result.host).toBe("proxy-server_1.example.com");
  });
});

describe("pickDiagnosticHeaders edge cases", () => {
  test("handles nested header values", () => {
    const headers = {
      server: "nginx",
      "x-cache": ["HIT", "MISS"],
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result["x-cache"]).toEqual(["HIT", "MISS"]);
  });

  test("handles undefined header values", () => {
    const headers = {
      server: undefined,
      via: "proxy",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result.server).toBeUndefined();
    expect(result.via).toBe("proxy");
  });

  test("preserves exact casing in header values", () => {
    const headers = {
      server: "NginX/1.21",
    };
    const result = pickDiagnosticHeaders(headers);
    expect(result.server).toBe("NginX/1.21");
  });
});

// ── fetch/fingerprint – fetchHtmlWithFingerprint blocked URL ─────────────────

describe("fetch/fingerprint – blocked URL throws", () => {
  test("throws 'Blocked URL' when isAllowedUrl returns false", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const isAllowedUrl = async () => false;
    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/article",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            body: "<html/>",
            headers: {},
            statusCode: 200,
          }),
        },
      ),
    ).rejects.toThrow("Blocked URL");
  });
});

// ── lib/fetch/bot-detection – detectBotProtection ────────────────────────────

describe("lib/fetch/bot-detection – detectBotProtection", () => {
  const isAxiosErr = (is: boolean) =>
    ((_e: unknown) => is) as typeof import("axios").default.isAxiosError;
  const makeErr = (
    status: number,
    headers: Record<string, unknown> = {},
    data = "",
  ) => ({ response: { data, headers, status } });

  test("returns detected:false for non-axios errors", async () => {
    const { detectBotProtection } = await import("@/lib/fetch");
    const result = detectBotProtection(new Error("generic"), isAxiosErr(false));
    expect(result.bot.detected).toBe(false);
    expect(result.retryable).toBe(false);
  });

  test("returns retryable:true for 403 with no bot fingerprints", async () => {
    const { detectBotProtection } = await import("@/lib/fetch");
    const result = detectBotProtection(
      makeErr(403, {}, "some generic error"),
      isAxiosErr(true),
    );
    expect(result.retryable).toBe(true);
    expect(result.bot.detected).toBe(false);
  });

  test("returns detected:false for non-403/429 status codes", async () => {
    const { detectBotProtection } = await import("@/lib/fetch");
    const result = detectBotProtection(
      makeErr(500, {}, "Internal Server Error"),
      isAxiosErr(true),
    );
    expect(result.bot.detected).toBe(false);
    expect(result.retryable).toBe(false);
  });

  test("detects DataDome via x-datadome:protected header", async () => {
    const { detectBotProtection } = await import("@/lib/fetch");
    const result = detectBotProtection(
      makeErr(403, { "x-datadome": "protected" }),
      isAxiosErr(true),
    );
    expect(result.bot.detected).toBe(true);
    if (result.bot.detected) expect(result.bot.provider).toBe("DataDome");
  });

  test("detects PerimeterX via px-captcha in response body", async () => {
    const { detectBotProtection } = await import("@/lib/fetch");
    const result = detectBotProtection(
      makeErr(403, {}, "blocked by px-captcha challenge"),
      isAxiosErr(true),
    );
    expect(result.bot.detected).toBe(true);
    if (result.bot.detected) expect(result.bot.provider).toBe("PerimeterX");
  });

  test("detects Cloudflare via cf-mitigated:challenge header", async () => {
    const { detectBotProtection } = await import("@/lib/fetch");
    const result = detectBotProtection(
      makeErr(403, { "cf-mitigated": "challenge" }),
      isAxiosErr(true),
    );
    expect(result.bot.detected).toBe(true);
    if (result.bot.detected) expect(result.bot.provider).toBe("Cloudflare");
  });

  test("detects reCAPTCHA via g-recaptcha class in body", async () => {
    const { detectBotProtection } = await import("@/lib/fetch");
    const result = detectBotProtection(
      makeErr(403, {}, '<div class="g-recaptcha" data-sitekey="abc"></div>'),
      isAxiosErr(true),
    );
    expect(result.bot.detected).toBe(true);
    if (result.bot.detected) expect(result.bot.provider).toBe("reCAPTCHA");
  });
});

// ── lib/fetch/fingerprint – status-0, too-large, too-many-redirects ──────────

describe("lib/fetch/fingerprint – fetchHtmlWithFingerprint edge cases", () => {
  test("throws for statusCode 0 via requestFn (GotScrapingError)", async () => {
    // When requestFn (injected) returns status 0, it is NOT caught by the
    // statusCode===0 branch (TLS path only). Instead it falls through to the
    // \"< 200 || >= 300\" check which throws GotScrapingError.
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/article",
        async () => true,
        {},
        {
          requestFn: async () => ({
            body: "Connection refused",
            headers: {},
            statusCode: 0,
          }),
        },
      ),
    ).rejects.toThrow("Upstream responded with status 0");
  });

  test("throws when response body exceeds MAX_FEED_RESPONSE_SIZE_BYTES", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const { CONFIG } = await import("@/lib/config");

    const oversized = "x".repeat(CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES + 1);

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/article",
        async () => true,
        {},
        {
          requestFn: async () => ({
            body: oversized,
            headers: {},
            statusCode: 200,
          }),
        },
      ),
    ).rejects.toThrow("too large");
  });

  test("throws TooManyRedirects after 5 redirect hops", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");

    let hop = 0;
    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/start",
        async () => true, // all URLs allowed
        {},
        {
          requestFn: async () => ({
            body: "",
            headers: { location: `https://example.com/hop${++hop}` },
            statusCode: 301,
          }),
        },
      ),
    ).rejects.toThrow("Too many redirects");
  });

  test("throws 'Blocked redirect target' when redirect URL is disallowed", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");

    const isAllowedUrl = async (url: string) =>
      !url.includes("/blocked-redirect");

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/start",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            body: "",
            headers: { location: "https://example.com/blocked-redirect" },
            statusCode: 301,
          }),
        },
      ),
    ).rejects.toThrow("Blocked redirect target");
  });

  test("throws for redirect with empty Location header", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/redirect-no-location",
        async () => true,
        {},
        {
          requestFn: async () => ({
            body: "",
            headers: { location: "" }, // empty location
            statusCode: 302,
          }),
        },
      ),
    ).rejects.toThrow();
  });

  test("throws GotScrapingError for non-2xx/non-3xx status", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/article",
        async () => true,
        {},
        {
          requestFn: async () => ({
            body: "Not Found",
            headers: {},
            statusCode: 404,
          }),
        },
      ),
    ).rejects.toThrow();
  });
});

// ── lib/fetch/fingerprint – blocked redirect target and statusCode 0 paths ────

describe("lib/fetch/fingerprint – fetchHtmlWithFingerprint additional branches", () => {
  test("throws Blocked redirect target when a redirect resolves to a blocked URL", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const allowed = new Set<string>(["https://allowed.example.com/original"]);
    const isAllowedUrl = async (url: string) => allowed.has(url);

    await expect(
      fetchHtmlWithFingerprint(
        "https://allowed.example.com/original",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            body: "",
            headers: { location: "https://blocked.private.example.com/dest" },
            statusCode: 302,
          }),
        },
      ),
    ).rejects.toThrow("Blocked redirect target");
  });

  test("throws GotScrapingError when requestFn returns statusCode 0", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const isAllowedUrl = async (_url: string) => true;

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/page",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            body: "Connection refused",
            headers: {},
            statusCode: 0,
          }),
        },
      ),
    ).rejects.toThrow(); // GotScrapingError — statusCode 0 is < 200
  });

  test("throws Too many redirects after hitting redirect limit", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const isAllowedUrl = async (_url: string) => true;
    let hop = 0;

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/start",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            body: "",
            headers: { location: `https://example.com/hop-${++hop}` },
            statusCode: 302,
          }),
        },
      ),
    ).rejects.toThrow(/(Too many redirects|Blocked redirect target)/);
  });

  test("throws GotScrapingError for non-2xx non-3xx status code", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const isAllowedUrl = async (_url: string) => true;

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/page",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            body: "Service Unavailable",
            headers: {},
            statusCode: 503,
          }),
        },
      ),
    ).rejects.toThrow();
  });

  test("throws Upstream response too large when body exceeds size limit", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const isAllowedUrl = async (_url: string) => true;
    const bigBody = "x".repeat(15 * 1024 * 1024);

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/page",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            body: bigBody,
            headers: {},
            statusCode: 200,
          }),
        },
      ),
    ).rejects.toThrow("Upstream response too large");
  });

  test("throws Redirect without Location header when 302 has no location", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const isAllowedUrl = async (_url: string) => true;

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/page",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            body: "",
            headers: {},
            statusCode: 301,
          }),
        },
      ),
    ).rejects.toThrow("Redirect without Location header");
  });
});
