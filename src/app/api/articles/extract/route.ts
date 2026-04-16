import { NextRequest } from "next/server";

import { resolveUserProxy } from "@/lib/outbound-proxy";
import { serverApi } from "@/lib/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export { getHostname } from "@/lib/server";

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
