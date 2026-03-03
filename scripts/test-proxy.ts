#!/usr/bin/env bun
/**
 * Test proxy connectivity and verify IP address being used.
 * Usage: bun scripts/test-proxy.ts [proxy-url]
 * Example: bun scripts/test-proxy.ts socks5://184.178.172.3:4145
 */

import axios from "axios";
import net from "node:net";
import { SocksProxyAgent } from "socks-proxy-agent";

const proxyUrl = process.argv[2];

if (!proxyUrl) {
  console.error("Usage: bun scripts/test-proxy.ts <proxy-url>");
  console.error(
    "Example: bun scripts/test-proxy.ts socks5://184.178.172.3:4145",
  );
  process.exit(1);
}

function parseProxyUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10),
    protocol: parsed.protocol.replace(":", ""),
  };
}

async function testTcpConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function testProxy() {
  console.log(`Testing proxy: ${proxyUrl}\n`);

  const { host, port } = parseProxyUrl(proxyUrl);

  // Test 0: TCP connectivity
  console.log(`0. Testing TCP connectivity to ${host}:${port}...`);
  const tcpConnects = await testTcpConnection(host, port);
  if (!tcpConnects) {
    console.error(
      `   ❌ FAILED: Cannot connect to proxy on TCP level. Proxy may be down or unreachable.\n`,
    );
    process.exit(1);
  }
  console.log(`   ✅ TCP connection successful\n`);

  // Test 1: Check your IP without proxy
  console.log("1. Fetching your direct IP...");
  let directIp: string;
  try {
    const directResp = await axios.get("https://api.ipify.org?format=json");
    directIp = directResp.data.ip;
    console.log(`   Direct IP: ${directIp}\n`);
  } catch (err) {
    console.error(`   Failed: ${err}\n`);
    process.exit(1);
  }

  // Test 2: Check your IP through proxy
  console.log("2. Fetching IP through proxy...");
  try {
    const agent = new SocksProxyAgent(proxyUrl);
    const proxyResp = await axios.get("https://api.ipify.org?format=json", {
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
    });
    const proxyIp = proxyResp.data.ip;
    console.log(`   Proxy IP: ${proxyIp}\n`);

    if (proxyIp === directIp) {
      console.error(
        "❌ CRITICAL: Proxy and direct IPs are identical! SOCKS proxy is not routing traffic.\n",
      );
      console.error(`   This means the application is NOT using the proxy.\n`);
      process.exit(1);
    }
    console.log(`✅ SUCCESS: Proxy is working (${directIp} → ${proxyIp})\n`);
  } catch (err) {
    console.error(`   ❌ Failed: ${err}\n`);
    process.exit(1);
  }

  // Test 3: Try the actual problematic URL
  console.log("3. Testing abc27.com through proxy...");
  try {
    const agent = new SocksProxyAgent(proxyUrl);
    const testResp = await axios.get("https://www.abc27.com/", {
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
      validateStatus: () => true,
    });
    console.log(`   Status: ${testResp.status}`);
    if (testResp.status === 403) {
      console.log(
        "   ⚠️  Got 403 - site is blocking the proxy IP (this is expected)\n",
      );
    } else if (testResp.status === 200) {
      console.log("   ✅ SUCCESS - site responded with 200\n");
    } else {
      console.log(`   Status ${testResp.status}\n`);
    }
  } catch (err) {
    console.error(`   Failed: ${err}\n`);
  }

  console.log(
    "\n📊 Summary: If test 2 passed, proxy routes traffic correctly.",
  );
  console.log(
    "   403s in test 3 indicate IP reputation blocking, not a proxy bug.\n",
  );
}

testProxy().catch(console.error);
