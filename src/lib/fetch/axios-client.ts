import axios from "axios";
import https from "node:https";

import type { buildProxyConfig } from "./proxy";

import { upstreamAxios } from "./httpcloak-client";

export function buildAxiosGet(
  injectedGet: typeof axios.get | undefined,
  proxyConfig: ReturnType<typeof buildProxyConfig> | undefined,
  insecureTls: boolean,
): typeof axios.get {
  if (injectedGet) return injectedGet;
  const insecureAgent = insecureTls
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

  if (proxyConfig && proxyConfig.mode === "socks") {
    return (reqUrl, config) =>
      axios.get(reqUrl, {
        ...config,
        httpAgent: proxyConfig.httpAgent,
        httpsAgent: proxyConfig.httpsAgent,
        proxy: false as const,
      });
  }
  if (proxyConfig) {
    return (reqUrl, config) =>
      upstreamAxios.get(reqUrl, {
        ...config,
        proxy: proxyConfig.proxy,
        ...(insecureAgent && { httpsAgent: insecureAgent }),
      });
  }
  return (reqUrl, config) =>
    upstreamAxios.get(reqUrl, {
      ...config,
      ...(insecureAgent && { httpsAgent: insecureAgent }),
    });
}
