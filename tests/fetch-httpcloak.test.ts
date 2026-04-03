import { describe, expect, mock, test } from "bun:test";
import * as zlib from "zlib";

import {
  fetchHtmlWithHttpCloak,
} from "@/lib/fetch/httpcloak-client";
import { HttpCloakUpstreamError } from "@/lib/fetch/response";

describe("fetch/httpcloak-client", () => {
  test("does not inject custom request headers into httpcloak", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const requestFn = mock(async (_url: URL, headers: Record<string, string>) => {
      capturedHeaders = headers;
      return {
        body: "<html>ok</html>",
        headers: {} as Record<string, string | string[] | undefined>,
        statusCode: 200,
      };
    });

    const result = await fetchHtmlWithHttpCloak(
      "https://example.com/article",
      async () => true,
      {
        allowInsecureTls: true,
        proxyUrl: "socks5://proxy.example:1080",
      },
      { requestFn },
    );

    expect(result.html).toBe("<html>ok</html>");
    expect(capturedHeaders).toBeDefined();
    expect(result.requestHeaders).toEqual(capturedHeaders ?? {});
    expect(capturedHeaders ?? {}).toEqual({});
  });

  test("rejects blocked redirect targets", async () => {
    let callCount = 0;
    const mockRequest = async (url: URL) => {
      callCount += 1;
      if (url.href === "https://example.com/article") {
        return {
          body: "",
          headers: { location: "http://127.0.0.1/private" } as Record<
            string,
            string | string[] | undefined
          >,
          statusCode: 302,
        };
      }

      return {
        body: "ok",
        headers: {} as Record<string, string | string[] | undefined>,
        statusCode: 200,
      };
    };

    await expect(
      fetchHtmlWithHttpCloak(
        "https://example.com/article",
        async (candidateUrl) => !candidateUrl.includes("127.0.0.1"),
        undefined,
        { requestFn: mockRequest },
      ),
    ).rejects.toThrow("Blocked redirect target");

    expect(callCount).toBe(1);
  });

  test("returns decoded HTML on success", async () => {
    const requestFn = mock(async () => ({
      body: "<html>ok</html>",
      headers: {} as Record<string, string | string[] | undefined>,
      statusCode: 200,
    }));

    const result = await fetchHtmlWithHttpCloak(
      "https://example.com/article",
      async () => true,
      undefined,
      { requestFn },
    );

    expect(result.html).toBe("<html>ok</html>");
    expect(result.requestHeaders).toEqual({});
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  test("decodes gzip responses serialized as latin1 text", async () => {
    const html = "<html><body>fingerprint probe</body></html>";
    const requestFn = mock(async () => ({
      body: zlib.gzipSync(Buffer.from(html, "utf8")).toString("latin1"),
      headers: {
        "content-encoding": "gzip",
      } as Record<string, string | string[] | undefined>,
      statusCode: 200,
    }));

    const result = await fetchHtmlWithHttpCloak(
      "https://tls.peet.ws/api/all",
      async () => true,
      undefined,
      { requestFn },
    );

    expect(result.html).toBe(html);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  test("prefers decoded HTTPCloak text when content-encoding headers remain set", async () => {
    const html = "<html><body>already decoded</body></html>";
    const requestFn = mock(async () => ({
      body: Buffer.from(html, "utf8"),
      headers: {
        "content-encoding": "gzip",
      } as Record<string, string | string[] | undefined>,
      statusCode: 200,
      text: html,
    }));

    const result = await fetchHtmlWithHttpCloak(
      "https://example.com/article",
      async () => true,
      undefined,
      { requestFn },
    );

    expect(result.html).toBe(html);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  test("throws HttpCloakUpstreamError with a decoded upstream body", async () => {
    const responseBody = "<html><body>cf-browser-verification</body></html>";
    const requestFn = mock(async () => ({
      body: zlib.gzipSync(Buffer.from(responseBody, "utf8")).toString(
        "latin1",
      ),
      headers: {
        "cf-ray": "abc123",
        "content-encoding": "gzip",
      } as Record<string, string | string[] | undefined>,
      statusCode: 403,
    }));

    try {
      await fetchHtmlWithHttpCloak(
        "https://example.com/challenge",
        async () => true,
        undefined,
        { requestFn },
      );
      expect.unreachable("Expected fetchHtmlWithHttpCloak to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpCloakUpstreamError);

      const httpCloakUpstreamError = error as HttpCloakUpstreamError;
      expect(httpCloakUpstreamError.statusCode).toBe(403);
      expect(httpCloakUpstreamError.responseBody).toBe(responseBody);
      expect(httpCloakUpstreamError.responseHeaders["cf-ray"]).toBe("abc123");
      expect(httpCloakUpstreamError.requestHeaders).toEqual({});
    }
  });
});