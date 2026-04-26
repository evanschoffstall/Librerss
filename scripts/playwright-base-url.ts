const DEFAULT_PLAYWRIGHT_HOST = "127.0.0.1";
const DEFAULT_PLAYWRIGHT_PORT = 3100;

/**
 * Describes the playwright base URL env.
 */
interface PlaywrightBaseUrlEnv {
  PLAYWRIGHT_BASE_URL?: string;
  PLAYWRIGHT_HOST?: string;
  PLAYWRIGHT_PORT?: string;
}

/**
 * Build the playwright base url.
 * @param host - The host.
 * @param port - The port.
 * @returns The playwright base url.
 */
export function buildPlaywrightBaseUrl(host: string, port: number) {
  const normalizedHost = host.trim();

  if (!normalizedHost) {
    throw new Error("PLAYWRIGHT_HOST must not be empty.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `PLAYWRIGHT_PORT must be a valid TCP port. Received: ${port}`,
    );
  }

  return `http://${normalizedHost}:${port}`;
}

/**
 * Resolve the playwright base url.
 * @param env - The env.
 * @returns The playwright base url.
 */
export function resolvePlaywrightBaseUrl(
  env: PlaywrightBaseUrlEnv = process.env as PlaywrightBaseUrlEnv,
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
