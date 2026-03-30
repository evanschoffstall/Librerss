export { buildAxiosGet } from "./axios-client";
export {
    detectResponseCompatibilitySignal,
    detectSourceCompatibilitySignal,
} from "./compatibility-signal";
export type { SourceCompatibilitySignal } from "./compatibility-signal";
export { fetchHtmlWithHttpCloak, upstreamAxios } from "./httpcloak-client";
export { buildProxyConfig, SOCKS_PROTOCOLS } from "./proxy";
export {
    decompressBody,
    HttpCloakUpstreamError,
    pickDiagnosticHeaders,
} from "./response";
export { parseSocksProxy } from "./socks";

