/**
 * Canonical server barrel.
 *
 * Keep this surface centered on runtime-facing guards and proxy helpers used
 * by route handlers. Test-only utilities should be imported from their direct
 * modules to avoid inflating the public server API.
 */
export {
    type AuthenticatedUser,
    logAndRespondError,
    requireAuthenticatedUser,
    requireMutableAuthenticatedUser,
    requireMutableRequest, requireMutableUserAndJsonBody
} from "./guards";
export {
    detectProxyProtocol,
    MAX_PROXY_CREDENTIAL_LENGTH, MAX_PROXY_URL_LENGTH, normalizeProxyUrl,
    probeProxy,
    type ProxyStatus
} from "./proxy";
export {
    encryptStoredProxyPassword,
    materializeStoredProxyPassword,
    type ResolvedStoredProxyPassword,
    resolveStoredProxyPassword
} from "./proxy-credentials";
export * from "./services";

