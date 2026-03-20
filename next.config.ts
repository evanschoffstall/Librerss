import type { NextConfig } from "next";

import {
  type NetworkInterfaceInfo,
  networkInterfaces,
} from "node:os";

const ANY_IPV4_HOST_PATTERN = "*.*.*.*";

/**
 * Extracts a hostname from an absolute URL-like environment value.
 */
export function getHostnameFromValue(value: string | undefined) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.startsWith("*.")) {
    return trimmedValue.toLowerCase();
  }

  const normalizedValue = trimmedValue.includes("://")
    ? trimmedValue
    : `http://${trimmedValue}`;

  try {
    return new URL(normalizedValue).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns external IPv4 interface addresses that can serve the dev app on the LAN.
 */
export function getLocalNetworkInterfaceHosts(
  getInterfaces: typeof networkInterfaces = networkInterfaces,
) {
  return Object.values(getInterfaces())
    .flatMap((interfaceAddresses) => interfaceAddresses ?? [])
    .filter((address): address is NetworkInterfaceInfo => {
      const normalizedFamily = String(address.family);
      const isIpv4 = normalizedFamily === "IPv4" || normalizedFamily === "4";
      return isIpv4 && !address.internal;
    })
    .map((address) => address.address);
}

/**
 * Resolves development hosts that may load Next.js internal dev resources.
 *
 * Sources, in priority order:
 * 1. Local non-internal IPv4 interface addresses for LAN access
 * 2. `PLAYWRIGHT_BASE_URL` so automation uses the same host as the wrapper
 * 3. `ALLOWED_DEV_ORIGINS` as a comma-separated manual override for tunnels
 *    or forwarded hosts that are not discoverable from local interfaces
 */
export function resolveAllowedDevOrigins(
  getInterfaces: typeof networkInterfaces = networkInterfaces,
) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const explicitOriginHosts = (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((value) => getHostnameFromValue(value))
    .filter((hostname): hostname is string => hostname !== null);

  return [...new Set([
    ...(isDevelopment ? [ANY_IPV4_HOST_PATTERN] : []),
    ...getLocalNetworkInterfaceHosts(getInterfaces),
    getHostnameFromValue(process.env.PLAYWRIGHT_BASE_URL),
    ...explicitOriginHosts,
  ])].filter((hostname): hostname is string => hostname !== null);
}

/**
 * Builds the app-wide CSP, relaxing only the directives development mode requires.
 */
function buildContentSecurityPolicy() {
  const isDevelopment = process.env.NODE_ENV === "development";
  const connectSources = ["'self'"];
  const scriptSources = ["'self'", "'unsafe-inline'"];

  if (isDevelopment) {
    connectSources.push("ws:", "wss:");
    scriptSources.push("'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  allowedDevOrigins: resolveAllowedDevOrigins(),
  distDir: process.env.PLAYWRIGHT_NEXT_DIST_DIR?.trim() || ".next",
  async headers() {
    const contentSecurityPolicy = buildContentSecurityPolicy();

    return [
      {
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            // SECURITY: HSTS prevents SSL-stripping and MITM on subsequent
            // visits.  One-year max-age with includeSubDomains is the
            // OWASP-recommended baseline.  Remove or shorten during initial
            // rollout if you have HTTP-only subdomains.
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // Mitigates reflected / stored XSS by constraining resource
            // loading origins. Development additionally requires unsafe-eval
            // for React stack reconstruction and websocket connect sources for HMR.
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
        source: "/:path*",
      },
    ];
  },
  outputFileTracingIncludes: {
    // header-generator loads its bayesian network definitions from zip files at
    // runtime via __dirname.  Next.js standalone file tracing does not discover
    // these data files automatically, so they must be explicitly included so the
    // module can initialise correctly in production.
    "/api/**": [
      "./node_modules/header-generator/data_files/**",
      "./node_modules/generative-bayesian-network/**",
    ],
  },
  serverExternalPackages: [
    "got-scraping",
    "header-generator",
    "generative-bayesian-network",
    "node-tls-client",
    "koffi",
  ],
  typescript: {
    tsconfigPath:
      process.env.NEXT_TYPESCRIPT_CONFIG_PATH?.trim() || "tsconfig.json",
  },
};

export default nextConfig;
