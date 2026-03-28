#!/usr/bin/env bun
/**
 * Inspect the upstream transport response using the shared HTTPCloak path.
 * Fetches https://tls.peet.ws/api/all to show the resulting upstream metadata.
 *
 * Usage:
 *   bun scripts/test-httpcloak.ts [proxy-url]
 *   PROXY_URL=socks5://host:port bun scripts/test-httpcloak.ts
 */

import { fetchHtmlWithHttpCloak } from "@/lib/fetch";

const TARGET_URL = "https://tls.peet.ws/api/all";

function buildProxyUrl(
  baseProxyUrl?: string,
  proxyUser?: string,
  proxyPass?: string,
): string | undefined {
  if (!baseProxyUrl) return undefined;
  if (!proxyUser || !proxyPass) return baseProxyUrl;

  const parsed = new URL(baseProxyUrl);
  if (parsed.username || parsed.password) return baseProxyUrl;
  parsed.username = proxyUser;
  parsed.password = proxyPass;
  return parsed.toString();
}

async function inspectTransport() {
  const baseProxyUrl =
    process.argv[2] || process.env.PROXY_URL || process.env.GLOBAL_PROXY_URL;
  const proxyUser = process.env.PROXY_USER;
  const proxyPass = process.env.PROXY_PASS;
  let proxyUrl: string | undefined;

  try {
    proxyUrl = buildProxyUrl(baseProxyUrl, proxyUser, proxyPass);
  } catch {
    console.error("Invalid proxy URL format:", baseProxyUrl);
    process.exit(1);
  }

  const allowInsecureTls = process.env.ALLOW_INSECURE_TLS === "true";

  console.log("=".repeat(60));
  console.log("HTTPCloak Upstream Check");
  console.log("=".repeat(60));
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Proxy: ${redactProxyUrl(proxyUrl)}`);
  console.log(`Allow Insecure TLS: ${allowInsecureTls}`);
  console.log("=".repeat(60));
  console.log();

  try {
    const { html, requestHeaders } = await fetchHtmlWithHttpCloak(
      TARGET_URL,
      async () => true,
      {
        allowInsecureTls,
        proxyUrl,
      },
    );

    const responseData = JSON.parse(html) as Record<string, unknown>;

    console.log("RESPONSE DATA");
    console.log("=".repeat(60));
    console.log(JSON.stringify(responseData, null, 2));
    console.log("=".repeat(60));
    console.log();

    console.log("REQUEST HEADERS SENT");
    console.log("=".repeat(60));
    for (const [key, value] of Object.entries(requestHeaders)) {
      console.log(`${key}: ${value}`);
    }
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\nHTTPCloak inspection failed\n");
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  }
}

function redactProxyUrl(proxyUrl?: string): string {
  if (!proxyUrl) return "Direct (no proxy)";
  return proxyUrl.replace(/(\/\/)([^:]+):([^@]+)@/, "$1[user]:[pass]@");
}

void inspectTransport();