import {
  clientFeedBatchConcurrency,
  clientFeedBatchMaxUrls,
  clientFeedRequestTimeoutMs,
} from "@/lib";

const REQUEST_TIMEOUT_MS = 15_000;
const BATCH_REQUEST_TIMEOUT_BUFFER_MS = 5_000;

/**
 * Describes the API client.
 */
export interface ApiClient {
  delete<T = unknown>(
    url: string,
    config?: ApiClientConfig,
  ): Promise<ApiResponse<T>>;
  get<T = unknown>(
    url: string,
    config?: ApiClientConfig,
  ): Promise<ApiResponse<T>>;
  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiClientConfig,
  ): Promise<ApiResponse<T>>;
  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiClientConfig,
  ): Promise<ApiResponse<T>>;
  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: ApiClientConfig,
  ): Promise<ApiResponse<T>>;
}

/**
 * Describes the API client configuration.
 */
export interface ApiClientConfig {
  headers?: HeadersInit;
  keepalive?: boolean;
  responseType?: "blob" | "json" | "text";
  signal?: AbortSignal;
}

/**
 * Describes the API response.
 */
export interface ApiResponse<T> {
  data: T;
  headers: Record<string, string>;
  status: number;
  statusText: string;
}

/**
 * Structured fetch failure used by client services and UI error handling.
 */
export class ApiError<T = unknown> extends Error {
  /**
   * Stores the is API error.
   */
  readonly isApiError = true;

  /**
   * Creates a structured error for failed API requests.
   * @param message - Human-readable failure message exposed to callers.
   * @param code - Optional machine-readable error code returned by the server.
   * @param method - HTTP method used for the failed request.
   * @param requestHeaders - Request headers that were sent with the request.
   * @param response - Parsed response metadata when the server replied.
   * @param url - Request URL that produced the failure.
   */
  constructor(
    message: string,
    readonly code: null | string,
    readonly method: string,
    readonly requestHeaders: Record<string, string>,
    readonly response: ApiResponse<T> | undefined,
    readonly url: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Return whether is api error.
 * @param error - The error.
 * @returns Whether is api error.
 */
export function isApiError<T = unknown>(error: unknown): error is ApiError<T> {
  return (
    typeof error === "object" &&
    error !== null &&
    "isApiError" in error &&
    (error as { isApiError?: unknown }).isApiError === true
  );
}

/**
 * Resolve the batch request timeout ms.
 * @param urlCount - The url count value.
 * @returns The batch request timeout ms.
 */
export function resolveBatchRequestTimeoutMs(urlCount: number): number {
  const normalizedUrlCount = Math.max(
    1,
    Math.min(clientFeedBatchMaxUrls(), Math.trunc(urlCount)),
  );
  const normalizedConcurrency = Math.max(1, clientFeedBatchConcurrency());
  const waveCount = Math.ceil(normalizedUrlCount / normalizedConcurrency);

  return (
    waveCount * clientFeedRequestTimeoutMs() + BATCH_REQUEST_TIMEOUT_BUFFER_MS
  );
}

/**
 * Upper-bound batch timeout covering the largest allowed dashboard batch.
 */
export const BATCH_REQUEST_TIMEOUT_MS = resolveBatchRequestTimeoutMs(
  clientFeedBatchMaxUrls(),
);

let api: ApiClient = createApiClient();

/**
 * Create the api client.
 * @param fetchFn - The fetch fn.
 * @returns The api client.
 */
export function createApiClient(fetchFn: typeof fetch = fetch): ApiClient {
  return {
    /**
     * Process the delete.
     * @param url - The url.
     * @param config - The config.
     * @returns The delete.
     */
    delete: <T>(url: string, config?: ApiClientConfig) =>
      request<T>(fetchFn, "DELETE", url, undefined, config),
    /**
     * Return the .
     * @param url - The url.
     * @param config - The config.
     * @returns The .
     */
    get: <T>(url: string, config?: ApiClientConfig) =>
      request<T>(fetchFn, "GET", url, undefined, config),
    /**
     * Process the patch.
     * @param url - The url.
     * @param data - The data.
     * @param config - The config.
     * @returns The patch.
     */
    patch: <T>(url: string, data?: unknown, config?: ApiClientConfig) =>
      request<T>(fetchFn, "PATCH", url, data, config),
    /**
     * Process the post.
     * @param url - The url.
     * @param data - The data.
     * @param config - The config.
     * @returns The post.
     */
    post: <T>(url: string, data?: unknown, config?: ApiClientConfig) =>
      request<T>(fetchFn, "POST", url, data, config),
    /**
     * Process the put.
     * @param url - The url.
     * @param data - The data.
     * @param config - The config.
     * @returns The put.
     */
    put: <T>(url: string, data?: unknown, config?: ApiClientConfig) =>
      request<T>(fetchFn, "PUT", url, data, config),
  };
}

/**
 * Create the linked abort controller.
 * @param signal - The signal.
 * @returns The linked abort controller.
 */
export function createLinkedAbortController(signal?: AbortSignal): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();

  if (!signal) {
    return {
      controller,
      /**
       * Provides a no-op cleanup callback when no external signal is linked.
       * @returns Nothing.
       */
      dispose: () => undefined,
    };
  }

  if (signal.aborted) {
    controller.abort(signal.reason);
    return {
      controller,
      /**
       * Provides a no-op cleanup callback when the external signal is already aborted.
       * @returns Nothing.
       */
      dispose: () => undefined,
    };
  }

  /**
   * Process the handle abort.
   */
  const handleAbort = () => {
    controller.abort(signal.reason);
  };
  signal.addEventListener("abort", handleAbort, { once: true });

  return {
    controller,
    /**
     * Process the dispose.
     */
    dispose: () => {
      signal.removeEventListener("abort", handleAbort);
    },
  };
}

/**
 * Return the api client.
 * @returns The api client.
 */
export function getApiClient(): ApiClient {
  return api;
}

/**
 * Process the reset api client for testing.
 */
export function resetApiClientForTesting(): void {
  api = createApiClient();
}

/**
 * Process the set api client for testing.
 * @param client - The client.
 */
export function setApiClientForTesting(client: ApiClient): void {
  api = client;
}

/**
 * Process the with request deadline.
 * @param request - The request.
 * @param timeoutMs - The timeout ms value.
 * @param onTimeout - The callback that on timeout.
 * @returns The with request deadline.
 */
export async function withRequestDeadline<T>(
  request: Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      onTimeout?.();
      reject(new Error("Request timeout"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/**
 * Process the headers to record.
 * @param headers - The headers.
 * @returns The headers to record.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

/**
 * Parse the response body.
 * @param response - The response.
 * @param responseType - The response type.
 * @returns The response body.
 */
async function parseResponseBody<T>(
  response: Response,
  responseType: ApiClientConfig["responseType"],
): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  if (responseType === "blob") {
    return (await response.blob()) as T;
  }

  if (responseType === "text") {
    return (await response.text()) as T;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

/**
 * Process the request.
 * @param fetchFn - The fetch fn.
 * @param method - The method.
 * @param url - The url.
 * @param data - The data.
 * @param config - The config.
 * @returns The request.
 */
async function request<T>(
  fetchFn: typeof fetch,
  method: string,
  url: string,
  data?: unknown,
  config?: ApiClientConfig,
): Promise<ApiResponse<T>> {
  const headers = new Headers(config?.headers);
  const hasBody = data !== undefined;

  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;

  try {
    response = await fetchFn(url, {
      body: hasBody ? JSON.stringify(data) : undefined,
      credentials: "same-origin",
      headers,
      keepalive: config?.keepalive,
      method,
      signal: config?.signal,
    });
  } catch (error) {
    const code =
      error instanceof DOMException && error.name === "AbortError"
        ? "ABORT_ERR"
        : null;

    throw new ApiError(
      error instanceof Error
        ? error.message
        : `Request failed for ${method} ${url}`,
      code,
      method,
      headersToRecord(headers),
      undefined,
      url,
    );
  }

  const parsedResponse = await toApiResponse<T>(response, config?.responseType);

  if (!response.ok) {
    throw new ApiError(
      `Request failed with status code ${response.status}`,
      null,
      method,
      headersToRecord(headers),
      parsedResponse,
      url,
    );
  }

  return parsedResponse;
}

/**
 * Process the to api response.
 * @param response - The response.
 * @param responseType - The response type.
 * @returns The to api response.
 */
async function toApiResponse<T>(
  response: Response,
  responseType: ApiClientConfig["responseType"],
): Promise<ApiResponse<T>> {
  return {
    data: await parseResponseBody<T>(response, responseType),
    headers: headersToRecord(response.headers),
    status: response.status,
    statusText: response.statusText,
  };
}
