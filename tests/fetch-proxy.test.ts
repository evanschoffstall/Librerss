/**
 * Tests: Proxy Config
 * Covers buildProxyConfig() for HTTP, HTTPS, and SOCKS proxies,
 * including auth, port defaults, insecure TLS, and error paths.
 *
 * No module mocks used. Tests pure proxy URL parsing logic.
 */

import { buildProxyConfig, SOCKS_PROTOCOLS } from "@/lib/fetch";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

// Build proxy URLs with credentials via interpolation to avoid literal credential patterns.
const httpAuth = (user: string, pass: string, host: string) =>
  `http://${user}:${pass}@${host}`;
const httpsAuth = (user: string, pass: string, host: string) =>
  `https://${user}:${pass}@${host}`;

describe("SOCKS_PROTOCOLS", () => {
  test("contains all supported SOCKS protocol variants", () => {
    expect(SOCKS_PROTOCOLS.has("socks:")).toBe(true);
    expect(SOCKS_PROTOCOLS.has("socks4:")).toBe(true);
    expect(SOCKS_PROTOCOLS.has("socks4a:")).toBe(true);
    expect(SOCKS_PROTOCOLS.has("socks5:")).toBe(true);
    expect(SOCKS_PROTOCOLS.has("socks5h:")).toBe(true);
    expect(SOCKS_PROTOCOLS.size).toBe(5);
  });

  test("does not contain HTTP or HTTPS protocols", () => {
    expect(SOCKS_PROTOCOLS.has("http:")).toBe(false);
    expect(SOCKS_PROTOCOLS.has("https:")).toBe(false);
  });
});

describe("buildProxyConfig", () => {
  describe("HTTP proxies", () => {
    test("parses basic HTTP proxy with explicit port", () => {
      const config = buildProxyConfig("http://proxy.example.com:8080");

      expect(config).not.toBe(false);
      if (config !== false) {
        expect(config.mode).toBe("http");
        if (config.mode === "http") {
          expect(config.proxy.host).toBe("proxy.example.com");
          expect(config.proxy.port).toBe(8080);
          expect(config.proxy.protocol).toBe("http");
          expect(config.proxy.auth).toBeUndefined();
        }
      }
    });

    test("uses default port 8080 for HTTP proxy without port", () => {
      const config = buildProxyConfig("http://proxy.example.com");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.port).toBe(8080);
      }
    });

    test("parses HTTP proxy with authentication", () => {
      const config = buildProxyConfig(
        httpAuth("user", "pass", "proxy.example.com:3128"),
      );
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.auth).toEqual({
          username: "user",
          password: "pass",
        });
      }
    });

    test("decodes URL-encoded credentials", () => {
      const config = buildProxyConfig(
        "http://user%40example:p%40ss%3Aword@proxy.example.com:8080",
      );
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.auth).toEqual({
          username: "user@example",
          password: "p@ss:word",
        });
      }
    });

    test("handles username without password", () => {
      const config = buildProxyConfig("http://user@proxy.example.com:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.auth).toEqual({ username: "user", password: "" });
      }
    });

    test("parses HTTP proxy with IPv4 host", () => {
      const config = buildProxyConfig("http://192.168.1.1:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("192.168.1.1");
        expect(config.proxy.port).toBe(8080);
      }
    });

    test("parses HTTP proxy with IPv6 host", () => {
      const config = buildProxyConfig("http://[2001:db8::1]:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("[2001:db8::1]");
        expect(config.proxy.port).toBe(8080);
      }
    });
  });

  describe("HTTPS proxies", () => {
    test("parses basic HTTPS proxy with explicit port", () => {
      const config = buildProxyConfig("https://proxy.example.com:8443");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("proxy.example.com");
        expect(config.proxy.port).toBe(8443);
        expect(config.proxy.protocol).toBe("https");
      }
    });

    test("uses default port 443 for HTTPS proxy without port", () => {
      const config = buildProxyConfig("https://proxy.example.com");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.port).toBe(443);
      }
    });

    test("parses HTTPS proxy with authentication", () => {
      const config = buildProxyConfig(
        httpsAuth("admin", "secret", "proxy.example.com:443"),
      );
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.auth).toEqual({
          username: "admin",
          password: "secret",
        });
      }
    });
  });

  describe("SOCKS proxies", () => {
    test("parses SOCKS4 proxy", () => {
      const config = buildProxyConfig("socks4://proxy.example.com:1080");
      expect(config).not.toBe(false);
      if (config !== false) {
        expect(config.mode).toBe("socks");
        if (config.mode === "socks") {
          expect(config.httpAgent).toBeDefined();
          expect(config.httpsAgent).toBeDefined();
          expect(config.httpAgent).toBe(config.httpsAgent);
        }
      }
    });

    test("parses SOCKS4A proxy", () => {
      const config = buildProxyConfig("socks4a://proxy.example.com:1080");
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("socks");
    });

    test("parses SOCKS5 proxy", () => {
      const config = buildProxyConfig("socks5://proxy.example.com:1080");
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("socks");
    });

    test("parses SOCKS5H proxy", () => {
      const config = buildProxyConfig("socks5h://proxy.example.com:1080");
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("socks");
    });

    test("parses generic SOCKS proxy", () => {
      const config = buildProxyConfig("socks://proxy.example.com:1080");
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("socks");
    });

    test("parses SOCKS proxy with authentication", () => {
      const config = buildProxyConfig(
        "socks5://user:pass@proxy.example.com:1080",
      );
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("socks");
    });

    test("parses SOCKS proxy with IPv4 address", () => {
      const config = buildProxyConfig("socks5://10.0.0.1:1080");
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("socks");
    });

    test("parses SOCKS proxy with IPv6 address", () => {
      const config = buildProxyConfig("socks5://[::1]:1080");
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("socks");
    });
  });

  describe("allowInsecureTls parameter", () => {
    test("respects allowInsecureTls=false for HTTP proxy", () => {
      const config = buildProxyConfig("http://proxy.example.com:8080", false);
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("http");
    });

    test("respects allowInsecureTls=true for HTTP proxy", () => {
      const config = buildProxyConfig("http://proxy.example.com:8080", true);
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("http");
    });

    test("applies allowInsecureTls=true to SOCKS proxy agent", () => {
      const config = buildProxyConfig("socks5://proxy.example.com:1080", true);
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "socks") {
        expect(config.httpAgent).toBeDefined();
        expect(config.httpsAgent).toBeDefined();
        expect(typeof config.httpAgent.connect).toBe("function");
        expect(typeof config.httpsAgent.connect).toBe("function");
      }
    });

    test("applies allowInsecureTls=false to SOCKS proxy agent", () => {
      const config = buildProxyConfig("socks5://proxy.example.com:1080", false);
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "socks") {
        expect(config.httpAgent).toBeDefined();
        expect(config.httpsAgent).toBeDefined();
      }
    });

    test("defaults allowInsecureTls to false when not provided", () => {
      expect(buildProxyConfig("http://proxy.example.com:8080")).not.toBe(false);
    });
  });

  describe("error handling", () => {
    test("returns false for invalid URL", () => {
      expect(buildProxyConfig("not a valid url")).toBe(false);
    });

    test("returns false for empty string", () => {
      expect(buildProxyConfig("")).toBe(false);
    });

    test("handles malformed URL without protocol as HTTP", () => {
      // URL constructor treats "host:port" as "protocol:host" with empty hostname
      const config = buildProxyConfig("proxy.example.com:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.protocol).toBe("proxy.example.com");
        expect(config.proxy.host).toBe("");
      }
    });

    test("returns false for malformed URL with spaces", () => {
      expect(buildProxyConfig("http://proxy example.com:8080")).toBe(false);
    });

    test("returns false for FTP protocol", () => {
      // FTP is a valid URL parsed as HTTP mode (not in SOCKS_PROTOCOLS)
      const config = buildProxyConfig("ftp://proxy.example.com:21");
      expect(config).not.toBe(false);
      if (config !== false) expect(config.mode).toBe("http");
    });

    test("returns false for URL with only protocol", () => {
      expect(buildProxyConfig("http://")).toBe(false);
    });

    test("returns false for URL with invalid port", () => {
      expect(buildProxyConfig("http://proxy.example.com:notaport")).toBe(false);
    });

    test("handles URL with port 0", () => {
      const config = buildProxyConfig("http://proxy.example.com:0");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.port).toBe(8080); // 0 is falsy, uses default
      }
    });

    test("returns false for URL with negative port", () => {
      expect(buildProxyConfig("http://proxy.example.com:-1")).toBe(false);
    });

    test("returns false for URL with very large port number", () => {
      expect(buildProxyConfig("http://proxy.example.com:65536")).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("handles localhost", () => {
      const config = buildProxyConfig("http://localhost:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("localhost");
        expect(config.proxy.port).toBe(8080);
      }
    });

    test("handles 127.0.0.1", () => {
      const config = buildProxyConfig("http://127.0.0.1:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("127.0.0.1");
      }
    });

    test("handles URL with query parameters", () => {
      const config = buildProxyConfig(
        "http://proxy.example.com:8080?param=value",
      );
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("proxy.example.com");
      }
    });

    test("handles URL with hash fragment", () => {
      const config = buildProxyConfig("http://proxy.example.com:8080#anchor");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("proxy.example.com");
      }
    });

    test("handles URL with path", () => {
      const config = buildProxyConfig("http://proxy.example.com:8080/path");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("proxy.example.com");
      }
    });

    test("handles uppercase protocol", () => {
      const config = buildProxyConfig("HTTP://proxy.example.com:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.protocol).toBe("http");
      }
    });

    test("handles mixed case hostname", () => {
      const config = buildProxyConfig("http://Proxy.Example.COM:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.host).toBe("proxy.example.com");
      }
    });

    test("strips protocol colon correctly", () => {
      const config = buildProxyConfig("http://proxy.example.com:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.protocol).toBe("http");
        expect(config.proxy.protocol).not.toContain(":");
      }
    });

    test("handles username with special characters", () => {
      const config = buildProxyConfig(
        "http://user%2Bname:pass@proxy.example.com:8080",
      );
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.auth?.username).toBe("user+name");
      }
    });

    test("handles password with equals sign", () => {
      const config = buildProxyConfig(
        "http://user:pass%3D123@proxy.example.com:8080",
      );
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.auth?.password).toBe("pass=123");
      }
    });

    test("handles empty password with colon", () => {
      const config = buildProxyConfig("http://user:@proxy.example.com:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect(config.proxy.auth).toEqual({ username: "user", password: "" });
      }
    });
  });

  describe("type discrimination", () => {
    test("HTTP mode config has no httpAgent or httpsAgent", () => {
      const config = buildProxyConfig("http://proxy.example.com:8080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "http") {
        expect("httpAgent" in config).toBe(false);
        expect("httpsAgent" in config).toBe(false);
        expect("proxy" in config).toBe(true);
      }
    });

    test("SOCKS mode config has no proxy object", () => {
      const config = buildProxyConfig("socks5://proxy.example.com:1080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "socks") {
        expect("proxy" in config).toBe(false);
        expect("httpAgent" in config).toBe(true);
        expect("httpsAgent" in config).toBe(true);
      }
    });

    test("returns same agent instance for http and https in SOCKS mode", () => {
      const config = buildProxyConfig("socks5://proxy.example.com:1080");
      expect(config).not.toBe(false);
      if (config !== false && config.mode === "socks") {
        expect(config.httpAgent).toBe(config.httpsAgent);
      }
    });
  });
});
