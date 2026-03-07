import axios from "axios";
import https from "node:https";
import type { CookieJar } from "tough-cookie";
import { extractionAxios } from "./fingerprint";
import type { buildProxyConfig } from "./proxy";

export function buildAxiosGet(
  injectedGet: typeof axios.get | undefined,
  proxyConfig: ReturnType<typeof buildProxyConfig> | undefined,
  insecureTls: boolean,
  jar: CookieJar | undefined,
): typeof axios.get {
  if (injectedGet) return injectedGet;
  const insecureAgent = insecureTls
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

  if (proxyConfig && proxyConfig.mode === "socks") {
    return (reqUrl, config) =>
      axios.get(reqUrl, {
        ...config,
        proxy: false as const,
        httpAgent: proxyConfig.httpAgent,
        httpsAgent: proxyConfig.httpsAgent,
      });
  }
  if (proxyConfig && proxyConfig.mode === "http") {
    return (reqUrl, config) =>
      extractionAxios.get(reqUrl, {
        ...config,
        jar,
        proxy: proxyConfig.proxy,
        ...(insecureAgent && { httpsAgent: insecureAgent }),
      });
  }
  return (reqUrl, config) =>
    extractionAxios.get(reqUrl, {
      ...config,
      jar,
      ...(insecureAgent && { httpsAgent: insecureAgent }),
    });
}
