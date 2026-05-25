import type { NextRequest } from "next/server";

import { resolveUserProxy } from "@/lib/outbound-proxy";
import { serverApi } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Handle the POST request.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns A JSON response or error response.
 */
export async function POST(
  request: NextRequest,
  depsOrContext: serverApi.ExtractPostDeps | serverApi.RouteHandlerContext = {},
) {
  const resolveUserProxyFn =
    "resolveUserProxyFn" in depsOrContext
      ? depsOrContext.resolveUserProxyFn
      : undefined;

  return serverApi.handleArticleExtractPost(request, {
    ...depsOrContext,
    resolveUserProxyFn: resolveUserProxyFn ?? resolveUserProxy,
  });
}
