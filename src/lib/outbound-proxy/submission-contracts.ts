export interface EmbeddedUrlCredentials {
  password: null | string;
  sanitizedUrl: string;
  username: null | string;
}

export interface NormalizedProxySubmission {
  allowInsecureTls: boolean | undefined;
  embeddedCredentials: EmbeddedUrlCredentials | null;
  proxyPassword: null | string | undefined;
  proxyUrl: null | string;
  proxyUsername: null | string | undefined;
  rawProxyUrl: null | string;
}

export interface PersistedProxyRow {
  allowInsecureTls: boolean;
  proxyPassword: null | string;
  proxyUsername: null | string;
}

export interface ProxyRouteDeps {
  detectFn?: (host: string, port: number) => Promise<"http" | "socks5">;
  dnsCheckFn?: (host: string) => Promise<boolean>;
  getProxyRoutingCheckFn?: (options: {
    allowInsecureTls: boolean;
    proxyUrl: string;
  }) => Promise<import("./service").ProxyRoutingCheckResult>;
  probeFn?: (proxyUrl: string) => Promise<boolean>;
  requireAuthFn?: (
    request: import("next/server").NextRequest,
  ) => Promise<import("@/lib/server/guards").AuthenticatedUser | Response>;
}

export interface ProxySettingsRequestBody {
  allowInsecureTls?: boolean;
  proxyPassword?: null | string;
  proxyUrl?: null | string;
  proxyUsername?: null | string;
}

export interface SavedProxyRecord extends PersistedProxyRow {
  proxyUrl: null | string;
}

export interface SavedProxyView {
  allowInsecureTls: boolean;
  fallbackPassword: null | string;
  hasProxyPassword: boolean;
  proxyUrl: string;
  proxyUsername: null | string;
  storedProxyPassword: null | string;
}
