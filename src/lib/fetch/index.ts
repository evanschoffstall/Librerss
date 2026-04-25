export { detectResponseCompatibilitySignal } from "./compatibility-signal";
export type { SourceCompatibilitySignal } from "./compatibility-signal";
export { fetchHtmlWithHttpCloak } from "./httpcloak-client";
export {
  decompressBody,
  HttpCloakUpstreamError,
  pickDiagnosticHeaders,
} from "./response";
export {
  promoteHttpCloakProxyUrl,
  SOCKS_PROTOCOLS,
} from "@/lib/utils/httpcloak";
