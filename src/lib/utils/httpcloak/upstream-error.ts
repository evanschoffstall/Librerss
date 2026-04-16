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

export class HttpCloakUpstreamError extends Error {
  readonly allowInsecureTls: boolean;

  readonly proxyAddress: null | string;
  readonly proxyMode: string;
  readonly redirectHop: number;
  readonly requestHeaders: Record<string, string>;
  readonly responseBody: string;
  readonly responseHeaders: Record<string, string | string[] | undefined>;
  readonly statusCode: number;

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
