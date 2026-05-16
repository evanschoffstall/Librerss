import { serverApi } from "@/lib/server";

import type {
  NormalizedProxySubmission,
  ProxyRouteDeps,
} from "./submission-contracts";

import { resolvesToBlockedAddress } from "./dns-guard";
import { getProxyRoutingCheck, type ProxyRoutingCheckResult } from "./service";
import { detectProxyProtocol, probeProxy } from "./transport";

/**
 * Describes the authorized proxy dependencies.
 */
export interface AuthorizedProxyDependencies {
  detect: (host: string, port: number) => Promise<"http" | "socks5">;
  dnsCheck: (host: string) => Promise<boolean>;
  getProxyRoutingCheck: ProxyRoutingCheckFn;
  probe: (proxyUrl: string) => Promise<boolean>;
  requireAuth: (
    request: import("next/server").NextRequest,
  ) => Promise<Response | serverApi.AuthenticatedUser>;
}

/**
 * Defines the proxy routing check fn type.
 */
type ProxyRoutingCheckFn = (options: {
  allowInsecureTls: boolean;
  proxyUrl: string;
}) => Promise<ProxyRoutingCheckResult>;

/**
 * Resolve the authorized proxy deps.
 * @param deps - The deps.
 * @returns The authorized proxy deps.
 */
export function resolveAuthorizedProxyDeps(
  deps: ProxyRouteDeps,
): AuthorizedProxyDependencies {
  return {
    detect: deps.detectFn ?? detectProxyProtocol,
    dnsCheck: deps.dnsCheckFn ?? resolvesToBlockedAddress,
    getProxyRoutingCheck: resolveProxyRoutingCheckDependency(deps),
    probe: deps.probeFn ?? probeProxy,
    requireAuth:
      deps.requireAuthFn ?? serverApi.requireMutableAuthenticatedUser,
  };
}

/**
 * Resolve the effective proxy credentials.
 * @param submission - The submission.
 * @returns The effective proxy credentials.
 */
export function resolveEffectiveProxyCredentials(
  submission: NormalizedProxySubmission,
) {
  return {
    effectiveProxyPassword:
      submission.proxyPassword ??
      submission.embeddedCredentials?.password ??
      undefined,
    effectiveProxyUsername:
      submission.proxyUsername ??
      submission.embeddedCredentials?.username ??
      undefined,
  };
}

/**
 * Resolves the proxy routing check dependency, falling back to the module's
 * own {@link getProxyRoutingCheck} implementation when no override is provided.
 *
 * The inline wrapper exists so the optional `deps` parameter of
 * `getProxyRoutingCheck` is not exposed through `ProxyRoutingCheckFn` — callers
 * only supply the options they are aware of.
 *
 * @param deps - Route-level dependency overrides.
 * @returns A `ProxyRoutingCheckFn` bound to the resolved implementation.
 */
function resolveProxyRoutingCheckDependency(
  deps: ProxyRouteDeps,
): ProxyRoutingCheckFn {
  return (
    deps.getProxyRoutingCheckFn ?? ((options) => getProxyRoutingCheck(options))
  );
}
