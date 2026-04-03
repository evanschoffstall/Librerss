import { describe, expect, test } from "bun:test";

import { promoteHttpCloakProxyUrl, SOCKS_PROTOCOLS } from "@/lib/fetch";

describe("fetch/proxy", () => {
  test("tracks the supported SOCKS protocol variants", () => {
    expect(SOCKS_PROTOCOLS).toEqual(
      new Set(["socks4:", "socks4a:", "socks5:", "socks5h:", "socks:"]),
    );
  });

  test("promotes socks5 proxies to remote-DNS socks5h", () => {
    expect(promoteHttpCloakProxyUrl("socks5://proxy.example.com:1080")).toBe(
      "socks5h://proxy.example.com:1080",
    );
  });

  test("promotes socks4 proxies to remote-DNS socks4a", () => {
    expect(promoteHttpCloakProxyUrl("socks4://proxy.example.com:9050")).toBe(
      "socks4a://proxy.example.com:9050",
    );
  });

  test("leaves non-socks proxies unchanged", () => {
    expect(promoteHttpCloakProxyUrl("https://proxy.example.com:8443")).toBe(
      "https://proxy.example.com:8443",
    );
  });

  test("returns invalid proxy URLs unchanged", () => {
    expect(promoteHttpCloakProxyUrl("not-a-real-url")).toBe("not-a-real-url");
  });
});
