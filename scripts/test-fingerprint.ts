#!/usr/bin/env bun
/**
 * Check browser fingerprint using the proxy pipeline.
 * Fetches https://tls.peet.ws/api/all to verify TLS/HTTP fingerprint.
 *
 * Usage:
 *   bun scripts/check-fingerprint.ts [proxy-url]
 *   PROXY_URL=socks5://host:port bun scripts/check-fingerprint.ts
 *
 * Example:
 *   bun scripts/check-fingerprint.ts socks5://184.178.172.3:4145
 *   bun scripts/check-fingerprint.ts http://proxy.example.com:8080
 *   bun scripts/check-fingerprint.ts  # Direct connection
 */

import { fetchHtmlWithFingerprint } from "@/lib/fetch";

const FINGERPRINT_URL = "https://tls.peet.ws/api/all";

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

async function checkFingerprint() {
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
  console.log("Browser Fingerprint Check");
  console.log("=".repeat(60));
  console.log(`Target: ${FINGERPRINT_URL}`);
  console.log(`Proxy: ${redactProxyUrl(proxyUrl)}`);
  console.log(`Allow Insecure TLS: ${allowInsecureTls}`);
  console.log("=".repeat(60));
  console.log();

  try {
    console.log("Fetching fingerprint data...\n");

    const { html, requestHeaders } = await fetchHtmlWithFingerprint(
      FINGERPRINT_URL,
      async () => true, // Allow all URLs
      {
        allowInsecureTls,
        proxyUrl,
      },
    );

    // Parse the JSON response
    let fingerprintData: Record<string, unknown>;
    try {
      fingerprintData = JSON.parse(html);
    } catch {
      console.error("Failed to parse response as JSON:");
      console.log(html.slice(0, 500));
      process.exit(1);
    }

    // Display the fingerprint data
    console.log("FINGERPRINT DATA");
    console.log("=".repeat(60));
    console.log(JSON.stringify(fingerprintData, null, 2));
    console.log("=".repeat(60));
    console.log();

    // Display request headers that were sent
    console.log("REQUEST HEADERS SENT");
    console.log("=".repeat(60));
    for (const [key, value] of Object.entries(requestHeaders)) {
      console.log(`${key}: ${value}`);
    }
    console.log("=".repeat(60));
    console.log();

    // Extract and highlight key fingerprint indicators
    console.log("KEY INDICATORS");
    console.log("=".repeat(60));
    if ("tls" in fingerprintData) {
      const tls = fingerprintData.tls as Record<string, unknown>;
      console.log(`TLS Version: ${tls.version || "N/A"}`);
      console.log(`TLS Cipher: ${tls.cipher || "N/A"}`);
      console.log(`JA3 Hash: ${tls.ja3 || tls.ja3_hash || "N/A"}`);
      console.log(`JA4 Hash: ${tls.ja4 || "N/A"}`);
    }
    if ("http" in fingerprintData) {
      const http = fingerprintData.http as Record<string, unknown>;
      const headers = http.headers as Record<string, unknown> | undefined;
      if (headers) {
        console.log(
          `User-Agent: ${headers["user-agent"] || headers["User-Agent"] || "N/A"}`,
        );
        console.log(
          `Sec-Ch-Ua: ${headers["sec-ch-ua"] || headers["Sec-Ch-Ua"] || "N/A"}`,
        );
      }
    }
    if ("http2" in fingerprintData) {
      const http2 = fingerprintData.http2 as Record<string, unknown>;
      console.log(`HTTP/2 Fingerprint: ${http2.fingerprint || "N/A"}`);
      console.log(`Akamai Hash: ${http2.akamai_hash || "N/A"}`);
    }
    console.log("=".repeat(60));
    console.log();

    console.log("✅ Fingerprint check completed successfully");
  } catch (err) {
    console.error("\n❌ FINGERPRINT CHECK FAILED\n");
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
      if (err.stack) {
        console.error("\nStack trace:");
        console.error(err.stack);
      }
    } else {
      console.error(String(err));
    }
    process.exit(1);
  }
}

function redactProxyUrl(proxyUrl?: string): string {
  if (!proxyUrl) return "Direct (no proxy)";
  return proxyUrl.replace(/(\/\/)([^:]+):([^@]+)@/, "$1[user]:[pass]@");
}

checkFingerprint();
