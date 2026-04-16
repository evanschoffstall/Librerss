import { serverApi } from "@/lib/server";

import type {
  NormalizedProxySubmission,
  ProxyRouteDeps,
} from "./submission-contracts";

import { resolvesToBlockedAddress } from "./dns-guard";
import { getProxyRoutingCheck, type ProxyRoutingCheckResult } from "./service";
import { detectProxyProtocol, probeProxy } from "./transport";

export interface AuthorizedProxyDependencies {
  detect: (host: string, port: number) => Promise<"http" | "socks5">;
  dnsCheck: (host: string) => Promise<boolean>;
  getProxyRoutingCheck: ProxyRoutingCheckFn;
  probe: (proxyUrl: string) => Promise<boolean>;
  requireAuth: (
    request: import("next/server").NextRequest,
  ) => Promise<Response | serverApi.AuthenticatedUser>;
}

type ProxyRoutingCheckFn = (options: {
  allowInsecureTls: boolean;
  proxyUrl: string;
}) => Promise<ProxyRoutingCheckResult>;

/** Maps route dependency overrides to the effective proxy route helper set. */
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

/** Resolves the effective username/password pair from dedicated fields or embedded URL credentials. */
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

function resolveProxyRoutingCheckDependency(
  deps: ProxyRouteDeps,
): ProxyRoutingCheckFn {
  return (
    deps.getProxyRoutingCheckFn ??
    ((options) =>
      (getProxyRoutingCheck as unknown as ProxyRoutingCheckFn)(options))
  );
}
