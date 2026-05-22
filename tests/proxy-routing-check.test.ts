import { afterEach, describe, expect, test } from "bun:test";

import { getProxyRoutingCheck } from "@/lib/outbound-proxy/service";

afterEach(() => {
  Object.assign(process.env, { NODE_ENV: "test" });
});

describe("server proxy routing check", () => {
  test("returns verified when direct and proxied egress IPs differ", async () => {
    const fetchPublicIp = async (
      url: string,
      validateUrl: (candidateUrl: string) => boolean,
      options?: { proxyUrl?: string },
    ) => {
      await expect(validateUrl(url)).resolves.toBe(true);
      await expect(validateUrl("https://malicious.example.com")).resolves.toBe(
        false,
      );

      return {
        html: options?.proxyUrl ? "198.51.100.25\n" : "203.0.113.10\n",
      };
    };

    await expect(
      getProxyRoutingCheck(
        {
          proxyUrl: "http://proxy.example:8080",
        },
        { fetchHtmlWithHttpCloakFn: fetchPublicIp as never },
      ),
    ).resolves.toEqual({
      directIp: "203.0.113.10",
      error: null,
      proxyExitIp: "198.51.100.25",
      status: "verified",
    });
  });

  test("returns same-egress when direct and proxied requests resolve to the same IP", async () => {
    const fetchPublicIp = async () => ({ html: "203.0.113.10\n" });

    await expect(
      getProxyRoutingCheck(
        {
          proxyUrl: "http://proxy.example:8080",
        },
        { fetchHtmlWithHttpCloakFn: fetchPublicIp as never },
      ),
    ).resolves.toEqual({
      directIp: "203.0.113.10",
      error: null,
      proxyExitIp: "203.0.113.10",
      status: "same-egress",
    });
  });

  test("returns proxy-only when the direct request fails but the proxied request succeeds", async () => {
    const directError = new Error("direct egress unavailable");
    let proxiedAttempts = 0;
    const fetchPublicIp = async (
      url: string,
      _validateUrl: (candidateUrl: string) => boolean,
      options?: { proxyUrl?: string },
    ) => {
      if (!options?.proxyUrl) {
        throw directError;
      }

      proxiedAttempts += 1;
      if (proxiedAttempts < 3) {
        throw new Error(`provider ${proxiedAttempts} unavailable`);
      }

      expect(url).toBe("https://api.ipify.org?format=json");
      return { html: JSON.stringify({ ip: "198.51.100.77" }) };
    };

    await expect(
      getProxyRoutingCheck(
        {
          proxyUrl: "http://proxy.example:8080",
        },
        { fetchHtmlWithHttpCloakFn: fetchPublicIp as never },
      ),
    ).resolves.toEqual({
      directIp: null,
      error: "direct egress unavailable",
      proxyExitIp: "198.51.100.77",
      status: "proxy-only",
    });
  });

  test("returns error when the proxied request never yields a valid public IP", async () => {
    const fetchPublicIp = async (
      url: string,
      _validateUrl: (candidateUrl: string) => boolean,
      options?: { proxyUrl?: string },
    ) => {
      if (!options?.proxyUrl) {
        return {
          html: url.endsWith("format=json")
            ? '{"ip":"203.0.113.10"}'
            : "203.0.113.10\n",
        };
      }

      if (url.endsWith("format=json")) {
        return { html: '{"ip":"not-an-ip"}' };
      }

      return { html: "" };
    };

    await expect(
      getProxyRoutingCheck(
        {
          proxyUrl: "http://proxy.example:8080",
        },
        { fetchHtmlWithHttpCloakFn: fetchPublicIp as never },
      ),
    ).resolves.toEqual({
      directIp: "203.0.113.10",
      error: "Exit IP check returned an invalid IP address.",
      proxyExitIp: null,
      status: "error",
    });
  });
});
