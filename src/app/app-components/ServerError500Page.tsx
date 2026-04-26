import type { ReactNode } from "react";

import { AlertTriangle } from "lucide-react";

import { StatusPage } from "./StatusPage";

/**
 * Describes the props for the shared 500 error page shell.
 *
 * The `action` prop accepts any renderable node so that the component can be
 * used in both server and client component trees. Server pages supply a
 * Next.js `<Link>` while client error boundaries supply an `onClick` reset
 * button — the shell itself stays boundary-agnostic.
 */
interface ServerError500PageProps {
  /** The call-to-action rendered below the error message (e.g. A reset button or a home link). */
  action: ReactNode;
}

/**
 * Render the shared 500 error page shell.
 *
 * This component is the single source of truth for the 500 error UI used by
 * both `global-error.tsx` (React error boundary, client tree) and
 * `src/app/error/page.tsx` (navigable server error page). Both surfaces use
 * identical copy and visual layout; only the recovery action differs.
 *
 * @param props - The component props. The `action` field is the call-to-action
 *   rendered below the error message — a reset button or a home link depending
 *   on the calling surface.
 * @returns The rendered 500 status page.
 */
export function ServerError500Page(props: ServerError500PageProps) {
  const { action } = props;
  return (
    <StatusPage
      action={action}
      code="500"
      eyebrow="Something went wrong"
      icon={AlertTriangle}
      iconClassName="size-7 text-destructive"
      message="An unexpected error occurred. Please try again, or return to the home page if the problem persists."
    />
  );
}
