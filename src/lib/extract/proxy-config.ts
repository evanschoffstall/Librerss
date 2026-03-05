import { SocksProxyAgent } from "socks-proxy-agent";

export type ProxyConfig =
  | {
      mode: "http";
      proxy: {
        host: string;
        port: number;
        protocol: string;
        auth?: { username: string; password: string };
      };
    }
  | { mode: "socks"; httpAgent: SocksProxyAgent; httpsAgent: SocksProxyAgent };

export const SOCKS_PROTOCOLS = new Set([
  "socks:",
  "socks4:",
  "socks4a:",
  "socks5:",
  "socks5h:",
]);

/** Parse a proxy URL string into axios-compatible config (HTTP or SOCKS). */
export function buildProxyConfig(
  proxyUrl: string,
  allowInsecureTls = false,
): ProxyConfig | false {
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
      return { mode: "socks", httpAgent: agent, httpsAgent: agent };
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
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
      };
    return result;
  } catch {
    return false;
  }
}
