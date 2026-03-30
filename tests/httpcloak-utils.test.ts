import { describe, expect, test } from "bun:test";

import {
  promoteHttpCloakProxyUrl,
  requestWithHttpCloakValidatedRedirects,
  resolveHttpCloakConnectTo,
} from "@/lib/utils/httpcloak";

describe("utils/httpcloak", () => {
  test("promoteHttpCloakProxyUrl upgrades SOCKS URLs to remote-DNS variants", () => {
    expect(promoteHttpCloakProxyUrl("socks5://proxy.example:1080")).toBe(
      "socks5h://proxy.example:1080",
    );
    expect(
      promoteHttpCloakProxyUrl("socks5://alice:secret@proxy.example:1080"),
    ).toBe("socks5h://alice:secret@proxy.example:1080");
    expect(promoteHttpCloakProxyUrl("socks4://proxy.example:1080")).toBe(
      "socks4a://proxy.example:1080",
    );
  });

  test("promoteHttpCloakProxyUrl preserves already-correct or non-SOCKS URLs", () => {
    expect(promoteHttpCloakProxyUrl("socks5h://proxy.example:1080")).toBe(
      "socks5h://proxy.example:1080",
    );
    expect(promoteHttpCloakProxyUrl("http://proxy.example:8080")).toBe(
      "http://proxy.example:8080",
    );
    expect(promoteHttpCloakProxyUrl(undefined)).toBeUndefined();
  });

  test("resolveHttpCloakConnectTo skips non-SOCKS proxies", async () => {
    await expect(
      resolveHttpCloakConnectTo(
        "https://example.com/article",
        "http://proxy.example:8080",
      ),
    ).resolves.toBeUndefined();
  });

  test("requestWithHttpCloakValidatedRedirects passes the promoted proxy URL to Session", async () => {
    let capturedProxy: null | string | undefined;
    let capturedConnectTo: Record<string, string> | undefined;

    const response = await requestWithHttpCloakValidatedRedirects(
      {
        maxRedirects: 0,
        proxyUrl: "socks5://alice:secret@proxy.example:1080",
        timeoutMs: 1_000,
        url: "https://example.com/article",
        validateUrl: async () => {},
      },
      {
        createSessionFn: (options) => {
          capturedConnectTo = options.connectTo;
          capturedProxy = options.proxy;

          return {
            close: () => {},
            get: async () => ({
              body: "ok",
              headers: {},
              statusCode: 200,
            }),
          };
        },
        resolveConnectToFn: async () => ({ "example.com": "93.184.216.34" }),
      },
    );

    expect(response.statusCode).toBe(200);
    expect(capturedConnectTo).toEqual({ "example.com": "93.184.216.34" });
    expect(capturedProxy).toBe("socks5h://alice:secret@proxy.example:1080");
  });
});