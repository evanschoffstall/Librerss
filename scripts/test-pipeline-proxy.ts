#!/usr/bin/env bun
/**
 * Test the complete proxy pipeline by fetching google.com.
 * Uses credentials from .env.local if available.
 *
 * Usage:
 *   bun scripts/test-pipeline-proxy.ts
 *   bun scripts/test-pipeline-proxy.ts https://example.com
 *   bun scripts/test-pipeline-proxy.ts --direct  # Skip proxy
 *
 * Environment variables:
 *   PROXY_URL  - SOCKS5/HTTP proxy URL (e.g., socks5://host:port)
 *   PROXY_USER - Proxy username
 *   PROXY_PASS - Proxy password
 */

import { fetchHtmlWithFingerprint } from "@/lib/fetch";

async function testProxyPipeline() {
  const args = process.argv.slice(2);
  const skipProxy = args.includes("--direct");
  const targetUrl =
    args.find((arg) => arg.startsWith("http")) || "https://www.duckduckgo.com/";

  // Build proxy URL with credentials from environment
  const baseProxyUrl = skipProxy ? undefined : process.env.PROXY_URL;
  const proxyUser = process.env.PROXY_USER;
  const proxyPass = process.env.PROXY_PASS;

  let proxyUrl = baseProxyUrl;

  // Inject credentials into proxy URL if provided
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
  if (proxyUrl) {
    const redacted = proxyUrl.replace(
      /(\/\/)([^:]+):([^@]+)@/,
      "$1[user]:[pass]@",
    );
    console.log(`Proxy URL: ${redacted}`);
  }
  console.log(`Allow Insecure TLS: ${allowInsecureTls}`);
  console.log("=".repeat(70));
  console.log();

  try {
    console.log("🚀 Starting fetch with Chrome 131 uTLS fingerprint...\n");

    const startTime = Date.now();

    const { html, requestHeaders } = await fetchHtmlWithFingerprint(
      targetUrl,
      async () => true, // Allow all URLs for testing
      {
        allowInsecureTls,
        proxyUrl,
      },
    );

    const duration = Date.now() - startTime;

    console.log("✅ SUCCESS");
    console.log("=".repeat(70));
    console.log(`Duration: ${duration}ms`);
    console.log(
      `Response Size: ${html.length} bytes (${(html.length / 1024).toFixed(2)} KB)`,
    );
    console.log("=".repeat(70));
    console.log();

    // Display request headers
    console.log("REQUEST HEADERS SENT");
    console.log("=".repeat(70));
    for (const [key, value] of Object.entries(requestHeaders)) {
      console.log(`${key}: ${value}`);
    }
    console.log("=".repeat(70));
    console.log();

    // Display response preview
    console.log("RESPONSE PREVIEW (first 500 chars)");
    console.log("=".repeat(70));
    console.log(html.slice(0, 500));
    console.log("=".repeat(70));
    console.log();

    // Extract title if present
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) {
      console.log(`Page Title: ${titleMatch[1].trim()}`);
      console.log();
    }

    // Check for bot detection indicators
    console.log("BOT DETECTION CHECK");
    console.log("=".repeat(70));
    const botIndicators = {
      cloudflare: /cf-browser-verification|challenge-platform/i.test(html),
      datadome: /datadome/i.test(html),
      perimeterX: /px[-_]captcha|perimeterx|\/_px\//i.test(html),
      recaptcha: /recaptcha/i.test(html),
    };

    if (Object.values(botIndicators).some(Boolean)) {
      console.log("⚠️  Bot detection indicators found:");
      if (botIndicators.datadome) console.log("  - DataDome");
      if (botIndicators.perimeterX) console.log("  - PerimeterX");
      if (botIndicators.cloudflare) console.log("  - Cloudflare Challenge");
      if (botIndicators.recaptcha) console.log("  - reCAPTCHA");
    } else {
      console.log("✅ No bot detection indicators found");
    }
    console.log("=".repeat(70));

    process.exit(0);
  } catch (err) {
    console.error("\n❌ FETCH FAILED");
    console.error("=".repeat(70));

    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);

      // Provide helpful diagnostics
      if (err.message.includes("host unreachable")) {
        console.error("\n💡 Diagnosis: Proxy server is unreachable");
        console.error("   Possible causes:");
        console.error("   - Proxy server is down or offline");
        console.error("   - Network connectivity issue");
        console.error("   - Firewall blocking the connection");
        console.error("   - Incorrect proxy URL or port");
      } else if (err.message.includes("authentication")) {
        console.error("\n💡 Diagnosis: Proxy authentication failed");
        console.error("   Check PROXY_USER and PROXY_PASS in .env.local");
      } else if (err.message.includes("timeout")) {
        console.error("\n💡 Diagnosis: Request timed out");
        console.error("   - Proxy may be slow or unresponsive");
        console.error("   - Target website may be blocking the request");
      }

      if (err.stack) {
        console.error("\nStack trace:");
        console.error(err.stack);
      }
    } else {
      console.error(String(err));
    }

    console.error("=".repeat(70));
    process.exit(1);
  }
}

testProxyPipeline().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
