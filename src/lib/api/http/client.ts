import axios from "axios";

const REQUEST_TIMEOUT_MS = 15_000;
export const BATCH_REQUEST_TIMEOUT_MS = 60_000;

// No global timeout on the axios instance — individual calls use
// withRequestDeadline() which provides a hard Promise.race-based deadline.
// Having both would create a confusing double-timeout with unclear error
// attribution.
type ApiClient = Pick<
  ReturnType<typeof axios.create>,
  "delete" | "get" | "patch" | "post" | "put"
>;

let api: ApiClient = axios.create();

export function createLinkedAbortController(signal?: AbortSignal): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();

  if (!signal) {
    return {
      controller,
      dispose: () => undefined,
    };
  }

  if (signal.aborted) {
    controller.abort();
    return {
      controller,
      dispose: () => undefined,
    };
  }

  const handleAbort = () => {
    controller.abort();
  };
  signal.addEventListener("abort", handleAbort, { once: true });

  return {
    controller,
    dispose: () => {
      signal.removeEventListener("abort", handleAbort);
    },
  };
}

export function getApiClient(): ApiClient {
  return api;
}

export function resetApiClientForTesting(): void {
  api = axios.create();
}

export function setApiClientForTesting(client: ApiClient): void {
  api = client;
}

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
