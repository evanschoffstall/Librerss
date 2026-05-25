import type { NextRequest } from "next/server";

import type {
  ProxyRouteDeps as OutboundProxyRouteDeps,
  ProxySettingsRequestBody,
} from "@/lib/outbound-proxy";
import type { RouteHandlerContext } from "@/lib/server";

import {
  handleProxySettingsGet,
  handleProxySettingsPut,
} from "@/lib/outbound-proxy";

export const dynamic = "force-dynamic";

/** Route dependency overrides used by proxy-route tests and local injection. */
export type ProxyRouteDeps = OutboundProxyRouteDeps;

/**
 * Handle the GET request.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns A JSON response or error response.
 */
export async function GET(
  request: NextRequest,
  depsOrContext: ProxyRouteDeps | RouteHandlerContext = {},
) {
  return handleProxySettingsGet(request, depsOrContext);
}

/**
 * Handle the PUT request.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns A JSON response or error response.
 */
export async function PUT(
  request: NextRequest,
  depsOrContext: ProxyRouteDeps | RouteHandlerContext = {},
) {
  const body = await parseProxySettingsBody(request);
  if (body instanceof Response) return body;
  return handleProxySettingsPut(request, body, depsOrContext);
}

/**
 * Parse the proxy settings body.
 * @param request - The request.
 * @returns The proxy settings body.
 */
async function parseProxySettingsBody(
  request: NextRequest,
): Promise<ProxySettingsRequestBody | Response> {
  try {
    const body = (await request.json()) as unknown;
    if (body === null || Array.isArray(body) || typeof body !== "object") {
      return Response.json(
        { error: "JSON body must be an object" },
        { status: 400 },
      );
    }
    return body as ProxySettingsRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
