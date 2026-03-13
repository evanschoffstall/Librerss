import { SocksProxyAgent } from "socks-proxy-agent";

type ProxyConfig =
  | { httpAgent: SocksProxyAgent; httpsAgent: SocksProxyAgent; mode: "socks" }
  | {
      mode: "http";
      proxy: {
        auth?: { password: string; username: string };
        host: string;
        port: number;
        protocol: string;
      };
    };

export const SOCKS_PROTOCOLS = new Set([
  "socks4:",
  "socks4a:",
  "socks5:",
  "socks5h:",
  "socks:",
]);

/** Parse a proxy URL string into axios-compatible config (HTTP or SOCKS). */
export function buildProxyConfig(
  proxyUrl: string,
  allowInsecureTls = false,
): false | ProxyConfig {
  try {
    const parsed = new URL(proxyUrl);
    if (SOCKS_PROTOCOLS.has(parsed.protocol)) {
      const agent = new SocksProxyAgent(proxyUrl);
      if (allowInsecureTls) {
        // Override the connect method to inject rejectUnauthorized: false
        // into the TLS upgrade options that socks-proxy-agent passes to
        // tls.connect(). Cast required because AgentConnectOpts union
        // doesn't expose TLS fields on the HTTP variant.
        const origConnect = agent.connect.bind(agent);
        agent.connect = (req, opts) =>
          origConnect(req, {
            ...opts,
            rejectUnauthorized: false,
          } as typeof opts);
      }
      return { httpAgent: agent, httpsAgent: agent, mode: "socks" };
    }
    const result: ProxyConfig & { mode: "http" } = {
      mode: "http",
      proxy: {
        host: parsed.hostname,
        port:
          Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 8080),
        protocol: parsed.protocol.replace(":", ""),
      },
    };
    if (parsed.username)
      result.proxy.auth = {
        password: decodeURIComponent(parsed.password),
        username: decodeURIComponent(parsed.username),
      };
    return result;
  } catch {
    return false;
  }
}
