import type { SocksClientOptions } from "socks";

export function parseSocksProxy(proxyUrl: string): SocksClientOptions["proxy"] {
  const parsed = new URL(proxyUrl);
  const type = parsed.protocol === "socks4:" ? 4 : 5;
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 1080,
    type: type,
    ...(parsed.username ? { userId: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password
      ? { password: decodeURIComponent(parsed.password) }
      : {}),
  };
}
