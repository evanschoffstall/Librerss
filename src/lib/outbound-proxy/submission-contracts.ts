/**
 * Describes the embedded URL credentials.
 */
export interface EmbeddedUrlCredentials {
  password: null | string;
  sanitizedUrl: string;
  username: null | string;
}

/**
 * Describes the normalized proxy submission.
 */
export interface NormalizedProxySubmission {
  embeddedCredentials: EmbeddedUrlCredentials | null;
  proxyPassword: null | string | undefined;
  proxyUrl: null | string;
  proxyUsername: null | string | undefined;
  rawProxyUrl: null | string;
}

/**
 * Describes the persisted proxy row.
 */
export interface PersistedProxyRow {
  proxyPassword: null | string;
  proxyUsername: null | string;
}

/**
 * Describes the proxy route deps.
 */
export interface ProxyRouteDeps {
  detectFn?: (host: string, port: number) => Promise<"http" | "socks5">;
  dnsCheckFn?: (host: string) => Promise<boolean>;
  getProxyRoutingCheckFn?: (options: {
    proxyUrl: string;
  }) => Promise<import("./service").ProxyRoutingCheckResult>;
  probeFn?: (proxyUrl: string) => Promise<boolean>;
  requireAuthFn?: (
    request: import("next/server").NextRequest,
  ) => Promise<import("@/lib/server/guards").AuthenticatedUser | Response>;
}

/**
 * Describes the proxy settings request body.
 */
export interface ProxySettingsRequestBody {
  proxyPassword?: null | string;
  proxyUrl?: null | string;
  proxyUsername?: null | string;
}

/**
 * Describes the saved proxy record.
 */
export interface SavedProxyRecord extends PersistedProxyRow {
  proxyUrl: null | string;
}

/**
 * Describes the saved proxy view.
 */
export interface SavedProxyView {
  fallbackPassword: null | string;
  hasProxyPassword: boolean;
  proxyUrl: string;
  proxyUsername: null | string;
  storedProxyPassword: null | string;
}
