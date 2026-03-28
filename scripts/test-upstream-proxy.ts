#!/usr/bin/env bun
/**
 * Exercise the full upstream proxy path using the shared HTTPCloak transport.
 *
 * Usage:
 *   bun scripts/test-upstream-proxy.ts
 *   bun scripts/test-upstream-proxy.ts https://example.com
 *   bun scripts/test-upstream-proxy.ts --direct
 */

import { fetchHtmlWithHttpCloak } from "@/lib/fetch";

async function testProxyPipeline() {
  const args = process.argv.slice(2);
  const skipProxy = args.includes("--direct");
  const targetUrl =
    args.find((arg) => arg.startsWith("http")) || "https://www.duckduckgo.com/";
  const baseProxyUrl = skipProxy ? undefined : process.env.PROXY_URL;
  const proxyUser = process.env.PROXY_USER;
  const proxyPass = process.env.PROXY_PASS;

  let proxyUrl = baseProxyUrl;
  if (baseProxyUrl && proxyUser && proxyPass) {
    try {
      const url = new URL(baseProxyUrl);
      url.username = proxyUser;
      url.password = proxyPass;
      proxyUrl = url.toString();
    } catch {
      console.error("Invalid PROXY_URL format:", baseProxyUrl);
      process.exit(1);
    }
  }

  const allowInsecureTls = process.env.ALLOW_INSECURE_TLS === "true";

  console.log("=".repeat(70));
  console.log("Proxy Pipeline Test");
  console.log("=".repeat(70));
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Proxy Mode: ${proxyUrl ? "Enabled" : "Direct (no proxy)"}`);
  console.log(`Allow Insecure TLS: ${allowInsecureTls}`);
  console.log("=".repeat(70));
  console.log();

  try {
    const startedAt = Date.now();
    const { html, requestHeaders } = await fetchHtmlWithHttpCloak(
      targetUrl,
      async () => true,
      {
        allowInsecureTls,
        proxyUrl,
      },
    );

    console.log("SUCCESS");
    console.log("=".repeat(70));
    console.log(`Duration: ${Date.now() - startedAt}ms`);
    console.log(`Response Size: ${html.length} bytes`);
    console.log("=".repeat(70));
    console.log();

    console.log("REQUEST HEADERS SENT");
    console.log("=".repeat(70));
    for (const [key, value] of Object.entries(requestHeaders)) {
      console.log(`${key}: ${value}`);
    }
    console.log("=".repeat(70));
    console.log();

    console.log("RESPONSE PREVIEW");
    console.log("=".repeat(70));
    console.log(html.slice(0, 500));
    console.log("=".repeat(70));
  } catch (error) {
    console.error("\nProxy pipeline failed");
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  }
}

void testProxyPipeline();