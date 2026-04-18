import { NextRequest, NextResponse } from "next/server";

const BLOCKED_REQUEST_STATUS = 403;
const FORBIDDEN_PAGE_PATH = "/forbidden";

export interface BlockedRequestPolicy {
  code: string;
  pagePath: string;
  pathPrefixes: readonly string[];
  responseMessage: string;
}

/**
 * @param policies
 */
function defineBlockedRequestPolicies(
  policies: readonly BlockedRequestPolicy[],
): readonly BlockedRequestPolicy[] {
  for (const policy of policies) {
    if (policy.code.trim().length === 0) {
      throw new Error("Blocked request policy code must not be empty.");
    }

    if (
      policy.pagePath.trim().length === 0 ||
      !policy.pagePath.startsWith("/")
    ) {
      throw new Error(
        `Blocked request policy ${policy.code} must use an absolute page path.`,
      );
    }

    if (policy.responseMessage.trim().length === 0) {
      throw new Error(
        `Blocked request policy ${policy.code} must provide a response message.`,
      );
    }

    if (policy.pathPrefixes.length === 0) {
      throw new Error(
        `Blocked request policy ${policy.code} must define at least one path prefix.`,
      );
    }

    for (const pathPrefix of policy.pathPrefixes) {
      if (pathPrefix.trim().length === 0 || !pathPrefix.startsWith("/")) {
        throw new Error(
          `Blocked request policy ${policy.code} contains an invalid path prefix: ${pathPrefix}`,
        );
      }
    }
  }

  return Object.freeze(
    policies.map((policy) =>
      Object.freeze({
        ...policy,
        pathPrefixes: Object.freeze([...policy.pathPrefixes]),
      }),
    ),
  );
}

export const blockedRequestPolicies = defineBlockedRequestPolicies([
  {
    code: "FW-RESERVED-PATH",
    pagePath: FORBIDDEN_PAGE_PATH,
    pathPrefixes: ["/@", "/~"],
    responseMessage: "Access to this path is blocked.",
  },
]);

/**
 * @param request
 * @param policy
 */
export function createBlockedRequestResponse(
  request: NextRequest,
  policy: BlockedRequestPolicy,
): NextResponse {
  const acceptsHtml =
    request.headers.get("accept")?.toLowerCase().includes("text/html") ?? false;

  const response = acceptsHtml
    ? NextResponse.rewrite(new URL(policy.pagePath, request.url), {
        status: BLOCKED_REQUEST_STATUS,
      })
    : NextResponse.json(
        {
          code: policy.code,
          error: "Forbidden",
          message: policy.responseMessage,
        },
        {
          status: BLOCKED_REQUEST_STATUS,
        },
      );

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Librerss-Firewall-Action", "block");
  response.headers.set("X-Librerss-Firewall-Code", policy.code);
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  return response;
}

/**
 * @param pathname
 */
export function matchBlockedRequestPolicy(
  pathname: string,
): BlockedRequestPolicy | null {
  for (const policy of blockedRequestPolicies) {
    if (
      policy.pathPrefixes.some((pathPrefix) => pathname.startsWith(pathPrefix))
    ) {
      return policy;
    }
  }

  return null;
}
