import type { NextRequest } from "next/server";

import type { RouteHandlerContext } from "@/lib/server";

import {
  handleProxySettingsGet,
  handleProxySettingsPut,
  type ProxyRouteDeps,
  type ProxySettingsRequestBody,
} from "@/lib/outbound-proxy";

export const dynamic = "force-dynamic";
export type { ProxyRouteDeps } from "@/lib/outbound-proxy";

/**
 * Render the get component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered get component.
 */
export async function GET(
  request: NextRequest,
  depsOrContext: ProxyRouteDeps | RouteHandlerContext = {},
) {
  return handleProxySettingsGet(request, depsOrContext);
}

/**
 * Render the put component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered put component.
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
