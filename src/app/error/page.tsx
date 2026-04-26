import { RotateCcw } from "lucide-react";
import Link from "next/link";

import { ServerError500Page } from "@/app/app-components";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib";
import { consumeFatalServerError } from "@/lib/server";

/**
 * Describes the props for the server error page.
 *
 * `searchParams` is the standard Next.js 15 async search-param bag. Redirecting
 * server endpoints include a `cid` (correlation ID) query parameter so that the
 * `[WARN] Server error page rendered` log entry can be tied back to the
 * `[ERROR]` entry emitted by the originating route before it issued the
 * redirect. Direct navigation (e.g. Manual URL entry) produces no `cid`, which
 * is logged as `"direct"` to make the distinction unambiguous.
 */
interface ServerErrorPageProps {
  searchParams: Promise<{ cid?: string | string[] }>;
}

/**
 * Render the server error page component.
 *
 * This page is the navigable counterpart to `global-error.tsx`. While
 * `global-error.tsx` activates as a React error boundary when the component
 * tree throws during rendering, this page is used by server-side navigation
 * endpoints (e.g. `/api/auth/dev-login`) that must redirect to an HTML error
 * surface rather than return a raw JSON 500 response.
 *
 * Every SSR request emits a `[WARN] Server error page rendered` log entry with
 * a `correlationId` field. When a route redirects here it passes its own
 * generated correlation ID in the `?cid=` query parameter, which is identical
 * to the ID used in the `[ERROR]` log entry emitted by that route before the
 * redirect. This creates a one-to-one match between the two server log lines,
 * making it trivial to locate the originating error even in high-volume logs.
 * A direct navigation (no `?cid=`) logs `correlationId: "direct"`.
 *
 * The "Try again" action navigates to `/`, which re-triggers the normal
 * app entry flow (auto-login or landing, depending on configuration). This
 * mirrors the intent of `global-error.tsx`'s `reset()` callback as closely
 * as possible within a static page context.
 *
 * @param props - The component props.
 * @returns The rendered server error page.
 */
export default async function ServerErrorPage(props: ServerErrorPageProps) {
  const { cid } = await props.searchParams;
  const correlationId = typeof cid === "string" ? cid : undefined;
  const fatalError = consumeFatalServerError(correlationId);

  if (fatalError) {
    logger.error("Server error page rendered after fatal backend error", {
      correlationId: fatalError.correlationId,
      error: fatalError.error,
      source: fatalError.source,
    });
  } else {
    logger.warn("Server error page rendered", {
      correlationId: correlationId ?? "direct",
    });
  }

  return (
    <ServerError500Page
      action={
        <Button asChild className="h-11 rounded-xl px-6" size="lg">
          <Link className="inline-flex items-center gap-2" href="/">
            <RotateCcw className="size-4" />
            Try again
          </Link>
        </Button>
      }
    />
  );
}
