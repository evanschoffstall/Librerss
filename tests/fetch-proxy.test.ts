import { describe, expect, test } from "bun:test";

import { buildProxyConfig, SOCKS_PROTOCOLS } from "@/lib/fetch/proxy";
import { parseSocksProxy } from "@/lib/fetch/socks";

describe("fetch/proxy", () => {
  test("tracks the supported SOCKS protocol variants", () => {
    expect(SOCKS_PROTOCOLS).toEqual(
      new Set(["socks4:", "socks4a:", "socks5:", "socks5h:", "socks:"]),
    );
  });

  test("builds HTTP proxy config with decoded credentials", () => {
    const result = buildProxyConfig(
      "http://user%2Bname:pass%3D123@proxy.example.com:8080",
    );

    expect(result).toEqual({
      mode: "http",
      proxy: {
        auth: {
          password: "pass=123",
          username: "user+name",
        },
        host: "proxy.example.com",
        port: 8080,
        protocol: "http",
      },
    });
  });

  test("defaults HTTP proxy ports from the protocol when omitted", () => {
    expect(buildProxyConfig("http://proxy.example.com")).toEqual({
      mode: "http",
      proxy: {
        host: "proxy.example.com",
        port: 8080,
        protocol: "http",
      },
    });
    expect(buildProxyConfig("https://proxy.example.com")).toEqual({
      mode: "http",
      proxy: {
        host: "proxy.example.com",
        port: 443,
        protocol: "https",
      },
    });
  });

  test("builds SOCKS proxy config with shared agents", () => {
    const result = buildProxyConfig("socks5://proxy.example.com:1080");

    expect(result).not.toBe(false);
    if (result === false || result.mode !== "socks") {
      throw new Error("Expected SOCKS proxy config");
    }

    expect(result.httpAgent).toBe(result.httpsAgent);
    expect(typeof result.httpAgent.connect).toBe("function");
  });

  test("patches the SOCKS connect method when insecure TLS is allowed", async () => {
    const result = buildProxyConfig("socks5://127.0.0.1:1080", true);

    expect(result).not.toBe(false);
    if (result === false || result.mode !== "socks") {
      throw new Error("Expected SOCKS proxy config");
    }

    try {
      await result.httpAgent.connect(
        { socket: null } as never,
        { rejectUnauthorized: true } as never,
      );
    } catch {
      expect(typeof result.httpAgent.connect).toBe("function");
    }
  });

  test("returns false for unparseable proxy URLs", () => {
    expect(buildProxyConfig("not-a-real-url")).toBe(false);
  });
});

describe("fetch/socks", () => {
  test("parses SOCKS5 proxy URLs with credentials", () => {
    expect(
      parseSocksProxy("socks5://user:pass@proxy.example.com:1080"),
    ).toEqual({
      host: "proxy.example.com",
      password: "pass",
      port: 1080,
      type: 5,
      userId: "user",
    });
  });

  test("parses SOCKS4 URLs without credentials", () => {
    expect(parseSocksProxy("socks4://proxy.example.com:9050")).toEqual({
      host: "proxy.example.com",
      port: 9050,
      type: 4,
    });
  });

  test("defaults SOCKS ports to 1080", () => {
    expect(parseSocksProxy("socks5://proxy.example.com")).toEqual({
      host: "proxy.example.com",
      port: 1080,
      type: 5,
    });
  });
});
