import type { NextConfig } from "next";

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import {
  arch,
  type NetworkInterfaceInfo,
  networkInterfaces,
  platform,
} from "node:os";
import { dirname, relative, resolve, sep } from "node:path";

const ANY_IPV4_HOST_PATTERN = "*.*.*.*";
const workspaceRequire = createRequire(import.meta.url);

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
 * Resolves the HTTPCloak native package name for the current build platform so
 * Next can externalize and trace the matching binary package.
 */
export function getHttpCloakPlatformPackageSpecifier(
  getPlatform: typeof platform = platform,
  getArchitecture: typeof arch = arch,
) {
  const platformName = getPlatform();
  const architectureName = getArchitecture();

  const normalizedPlatform =
    platformName === "darwin" || platformName === "win32"
      ? platformName
      : "linux";
  const normalizedArchitecture =
    architectureName === "x64" || architectureName === "arm64"
      ? architectureName
      : architectureName;

  return `@httpcloak/${normalizedPlatform}-${normalizedArchitecture}`;
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

/**
 * Walks upward from a resolved module entry until the owning package.json is
 * found, avoiding unsupported package.json export subpaths.
 */
function findPackageRootDirectory(entryPath: string) {
  let currentDirectory = dirname(entryPath);
  const filesystemRoot = resolve(currentDirectory, sep);

  while (true) {
    if (existsSync(resolve(currentDirectory, "package.json"))) {
      return currentDirectory;
    }

    if (currentDirectory === filesystemRoot) {
      throw new Error(`Unable to locate package root for ${entryPath}`);
    }

    currentDirectory = dirname(currentDirectory);
  }
}

/**
 * Resolves a package tracing glob only when the optional package exists in the
 * current install.
 */
function resolveOptionalPackageTracingGlob(packageSpecifier: string) {
  try {
    return resolvePackageTracingGlob(packageSpecifier);
  } catch {
    return null;
  }
}

/**
 * Resolves a package directory glob relative to the repository root so
 * Next.js file tracing includes native/runtime assets from external packages.
 */
function resolvePackageTracingGlob(packageSpecifier: string) {
  const packageDirectory = findPackageRootDirectory(
    workspaceRequire.resolve(packageSpecifier),
  );
  const relativeDirectory = relative(import.meta.dirname, packageDirectory)
    .split(sep)
    .join("/");

  return `./${relativeDirectory}/**`;
}

/**
 * Non-secret server config keys whose .env defaults are serialised at build
 * time.  Next.js DefinePlugin bakes the resulting JSON blob into server
 * bundles so values survive into Vercel serverless functions even when .env
 * files are not loaded into process.env at runtime.
 *
 * Sensitive values (DATABASE_URL, PROXY_CREDENTIAL_ENCRYPTION_KEY) are
 * intentionally excluded — set them via hosting platform env vars.
 */
const SERVER_CONFIG_KEYS = [
  "ALLOW_SIGNUP",
  "ARTICLE_EXTRACT_CACHE_DEV_ENABLED",
  "ARTICLE_EXTRACT_CACHE_ENABLED",
  "DB_EAGER_CONNECT_CHECK",
  "DNS_CACHE_MAX_ENTRIES",
  "DNS_CACHE_TTL_MS",
  "DNS_LOOKUP_TIMEOUT_MS",
  "FEED_BATCH_CONCURRENCY",
  "FEED_BATCH_MAX_URLS",
  "FEED_CACHE_TTL_MINUTES",
  "FEED_FORCE_REFRESH_TTL_MINUTES",
  "FEED_LOADING_FAILSAFE_MS",
  "FEED_REFRESH_DIAGNOSTICS_ENABLED",
  "FEED_REQUEST_ACCEPT",
  "FEED_REQUEST_TIMEOUT_MS",
  "FEED_REQUEST_USER_AGENT",
  "LEGAL_DEPLOYMENT_NAME",
  "LEGAL_OPERATOR_NAME",
  "LEGAL_PROFILE",
  "LOG_COLORS_ENABLED",
  "LOG_LEVEL",
  "MARK_ALL_READ_LIMIT",
  "MAX_ALL_ARTICLES_LIMIT",
  "MAX_ARTICLE_CONSECUTIVE_BLANK_LINES",
  "MAX_ARTICLE_CONTENT_LENGTH",
  "MAX_ARTICLE_TITLE_LENGTH",
  "MAX_ARTICLES_PER_FEED",
  "MAX_CATEGORY_NAME_LENGTH",
  "MAX_EMAIL_LENGTH",
  "MAX_FAVICON_CACHE_ENTRIES",
  "MAX_FEED_NAME_LENGTH",
  "MAX_FEED_RESPONSE_SIZE_BYTES",
  "MAX_JSON_BODY_BYTES",
  "MAX_SESSIONS_PER_USER",
  "MIN_ARTICLE_IMAGE_HEIGHT_PX",
  "MIN_ARTICLE_IMAGE_WIDTH_PX",
  "OPERATOR_CONTACT_EMAIL",
  "OPML_MAX_IMPORT_ENTRIES",
  "PASSWORD_COMPLEXITY_REQUIRED_TYPES",
  "PASSWORD_MAX_LENGTH",
  "PASSWORD_MIN_LENGTH",
  "RATE_LIMIT_DISABLED_IN_DEV",
  "RATE_LIMIT_EXTRACT_MAX_REQUESTS",
  "RATE_LIMIT_EXTRACT_WINDOW_MS",
  "RATE_LIMIT_FEED_BATCH_MAX_REQUESTS",
  "RATE_LIMIT_FEED_BATCH_WINDOW_MS",
  "RATE_LIMIT_FEED_MAX_REQUESTS",
  "RATE_LIMIT_FEED_WINDOW_MS",
  "RATE_LIMIT_LOGIN_MAX_ATTEMPTS",
  "RATE_LIMIT_LOGIN_WINDOW_MS",
  "RATE_LIMIT_PROXY_COMPATIBILITY_MAX_ATTEMPTS",
  "RATE_LIMIT_PROXY_COMPATIBILITY_WINDOW_MS",
  "RATE_LIMIT_PROXY_MAX_REQUESTS",
  "RATE_LIMIT_PROXY_WINDOW_MS",
  "RATE_LIMIT_SIGNUP_MAX_ATTEMPTS",
  "RATE_LIMIT_SIGNUP_WINDOW_MS",
  "SESSION_DURATION_DAYS",
  "TRUSTED_PROXY_COUNT",
] as const;

const buildTimeServerConfig = Object.fromEntries(
  SERVER_CONFIG_KEYS
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key] as string]),
);
const httpCloakPlatformPackageSpecifier =
  getHttpCloakPlatformPackageSpecifier();
const httpCloakRuntimeTracingGlob = resolvePackageTracingGlob("httpcloak");
const httpCloakPlatformTracingGlob = resolveOptionalPackageTracingGlob(
  httpCloakPlatformPackageSpecifier,
);
const koffiRuntimeTracingGlob = resolvePackageTracingGlob("koffi");
const serverExternalPackages = [
  "got-scraping",
  "header-generator",
  "generative-bayesian-network",
  "httpcloak",
  httpCloakPlatformPackageSpecifier,
  "node-tls-client",
  "koffi",
  "piscina",
  "tlsclientwrapper",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: resolveAllowedDevOrigins(),
  distDir: process.env.PLAYWRIGHT_NEXT_DIST_DIR?.trim() || ".next",
  env: {
    LIBRERSS_BUILD_CONFIG: JSON.stringify(buildTimeServerConfig),
  },
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
    // module can initialize correctly in production.
    "/api/**": [
      "./node_modules/header-generator/data_files/**",
      "./node_modules/generative-bayesian-network/**",
      httpCloakRuntimeTracingGlob,
      ...(httpCloakPlatformTracingGlob ? [httpCloakPlatformTracingGlob] : []),
      koffiRuntimeTracingGlob,
    ],
  },
  serverExternalPackages,
  typescript: {
    tsconfigPath:
      process.env.NEXT_TYPESCRIPT_CONFIG_PATH?.trim() || "tsconfig.json",
  },
};

export default nextConfig;
