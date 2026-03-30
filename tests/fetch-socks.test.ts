import { describe, expect, test } from "bun:test";

import { parseSocksProxy } from "@/lib/fetch/socks";

describe("parseSocksProxy", () => {
  test("parses a socks5 proxy URL and decodes credentials", () => {
    expect(
      parseSocksProxy("socks5://alice%40example.com:s3cr%20t@proxy.example:9050"),
    ).toEqual({
      host: "proxy.example",
      password: "s3cr t",
      port: 9050,
      type: 5,
      userId: "alice@example.com",
    });
  });

  test("defaults socks4 proxies to port 1080 when the URL omits a port", () => {
    expect(parseSocksProxy("socks4://proxy.example")).toEqual({
      host: "proxy.example",
      port: 1080,
      type: 4,
    });
  });
});