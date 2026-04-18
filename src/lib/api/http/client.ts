import {
  clientFeedBatchConcurrency,
  clientFeedBatchMaxUrls,
  clientFeedRequestTimeoutMs,
} from "@/lib";

const REQUEST_TIMEOUT_MS = 15_000;
const BATCH_REQUEST_TIMEOUT_BUFFER_MS = 5_000;

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

export interface ApiClientConfig {
  headers?: HeadersInit;
  responseType?: "blob" | "json" | "text";
  signal?: AbortSignal;
}

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
  readonly isApiError = true;

  /**
   * @param message
   * @param code
   * @param method
   * @param requestHeaders
   * @param response
   * @param url
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
 * @param error
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
 * Computes the client-side batch deadline from the server's own batch shape so
 * valid 207 Multi-Status responses are not preempted by an earlier client
 * timeout.
 * @param urlCount
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
 * @param fetchFn
 */
export function createApiClient(fetchFn: typeof fetch = fetch): ApiClient {
  return {
    /**
     * @param url
     * @param config
     */
    delete: <T>(url: string, config?: ApiClientConfig) =>
      request<T>(fetchFn, "DELETE", url, undefined, config),
    /**
     * @param url
     * @param config
     */
    get: <T>(url: string, config?: ApiClientConfig) =>
      request<T>(fetchFn, "GET", url, undefined, config),
    /**
     * @param url
     * @param data
     * @param config
     */
    patch: <T>(url: string, data?: unknown, config?: ApiClientConfig) =>
      request<T>(fetchFn, "PATCH", url, data, config),
    /**
     * @param url
     * @param data
     * @param config
     */
    post: <T>(url: string, data?: unknown, config?: ApiClientConfig) =>
      request<T>(fetchFn, "POST", url, data, config),
    /**
     * @param url
     * @param data
     * @param config
     */
    put: <T>(url: string, data?: unknown, config?: ApiClientConfig) =>
      request<T>(fetchFn, "PUT", url, data, config),
  };
}

/**
 * @param signal
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
       *
       */
      dispose: () => undefined,
    };
  }

  if (signal.aborted) {
    controller.abort(signal.reason);
    return {
      controller,
      /**
       *
       */
      dispose: () => undefined,
    };
  }

  /**
   *
   */
  const handleAbort = () => {
    controller.abort(signal.reason);
  };
  signal.addEventListener("abort", handleAbort, { once: true });

  return {
    controller,
    /**
     *
     */
    dispose: () => {
      signal.removeEventListener("abort", handleAbort);
    },
  };
}

/**
 *
 */
export function getApiClient(): ApiClient {
  return api;
}

/**
 *
 */
export function resetApiClientForTesting(): void {
  api = createApiClient();
}

/**
 * @param client
 */
export function setApiClientForTesting(client: ApiClient): void {
  api = client;
}

/**
 * @param request
 * @param timeoutMs
 * @param onTimeout
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
 * @param headers
 */
function headersToRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

/**
 * @param response
 * @param responseType
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
 * @param fetchFn
 * @param method
 * @param url
 * @param data
 * @param config
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
 * @param response
 * @param responseType
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
