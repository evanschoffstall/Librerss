const DEFAULT_PLAYWRIGHT_HOST = "127.0.0.1";
const DEFAULT_PLAYWRIGHT_PORT = 3100;

/** Builds the canonical Playwright base URL from the resolved host and port. */
export function buildPlaywrightBaseUrl(host: string, port: number) {
  const normalizedHost = host.trim();

  if (!normalizedHost) {
    throw new Error("PLAYWRIGHT_HOST must not be empty.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PLAYWRIGHT_PORT must be a valid TCP port. Received: ${port}`);
  }

  return `http://${normalizedHost}:${port}`;
}

/**
 * Resolves the Playwright endpoint from the wrapper-provided base URL first,
 * then falls back to wrapper host and port env vars, then repo defaults.
 */
export function resolvePlaywrightBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
) {
  const configuredBaseUrl = env.PLAYWRIGHT_BASE_URL?.trim();

  if (configuredBaseUrl) {
    const normalizedUrl = new URL(configuredBaseUrl);
    normalizedUrl.hash = "";

    return normalizedUrl.toString().replace(/\/$/u, "");
  }

  const configuredHost = env.PLAYWRIGHT_HOST?.trim() || DEFAULT_PLAYWRIGHT_HOST;
  const configuredPort = Number.parseInt(
    env.PLAYWRIGHT_PORT?.trim() ?? String(DEFAULT_PLAYWRIGHT_PORT),
    10,
  );

  return buildPlaywrightBaseUrl(configuredHost, configuredPort);
}

export { DEFAULT_PLAYWRIGHT_HOST, DEFAULT_PLAYWRIGHT_PORT };