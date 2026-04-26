/**
 * Describes the options for HTTP cloak upstream error.
 */
export interface HttpCloakUpstreamErrorOptions {
  allowInsecureTls: boolean;
  proxyAddress: null | string;
  proxyMode: string;
  redirectHop: number;
  requestHeaders: Record<string, string>;
  responseBody: string;
  responseHeaders: Record<string, string | string[] | undefined>;
  statusCode: number;
}

/**
 * Implements the HTTP cloak upstream error.
 */
export class HttpCloakUpstreamError extends Error {
  /**
       * Stores the allow insecure tls.
       */
  readonly allowInsecureTls: boolean;

  /**
       * Stores the proxy address.
       */
  readonly proxyAddress: null | string;
  /**
       * Stores the proxy mode.
       */
  readonly proxyMode: string;
  /**
       * Stores the redirect hop.
       */
  readonly redirectHop: number;
  /**
       * Stores the request headers.
       */
  readonly requestHeaders: Record<string, string>;
  /**
       * Stores the response body.
       */
  readonly responseBody: string;
  /**
       * Stores the response headers.
       */
  readonly responseHeaders: Record<string, string | string[] | undefined>;
  /**
       * Stores the status code.
       */
  readonly statusCode: number;

  /**
   * Creates an error wrapper for HTTPCloak upstream failures.
   * @param options - Upstream request and response metadata captured for diagnostics.
   * @param message - Optional custom error message overriding the default status-based message.
   */
  constructor(options: HttpCloakUpstreamErrorOptions, message?: string) {
    const resolvedMessage =
      message ?? `Upstream responded with status ${options.statusCode}`;

    super(resolvedMessage);
    this.allowInsecureTls = options.allowInsecureTls;
    this.name = "HttpCloakUpstreamError";
    this.proxyAddress = options.proxyAddress;
    this.proxyMode = options.proxyMode;
    this.redirectHop = options.redirectHop;
    this.requestHeaders = options.requestHeaders;
    this.responseBody = options.responseBody;
    this.responseHeaders = options.responseHeaders;
    this.statusCode = options.statusCode;
  }
}
