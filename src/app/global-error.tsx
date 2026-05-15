"use client";

import { RotateCcw } from "lucide-react";

import { ServerError500Page } from "@/app/app-components";
import { Button } from "@/components/ui/button";

/**
 * Describes the props for the global error boundary component.
 *
 * Next.js passes the thrown error and a `reset` callback that re-renders the
 * subtree from scratch. The component must include its own `<html>` and `<body>`
 * tags because it replaces the entire document when the root layout itself
 * throws.
 */
interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Render the global error boundary component.
 *
 * This is the client-side React error boundary of last resort. It activates
 * when the root layout or a component above the nearest `error.tsx` boundary
 * throws during rendering. The shared `ServerError500Page` shell provides the
 * copy and layout; only the recovery action differs from the navigable
 * `/error` server page.
 *
 * @param props - The component props.
 * @returns The rendered global error boundary page.
 */
export default function GlobalError(props: GlobalErrorProps) {
  const { reset } = props;
  return (
    <html className="dark" lang="en" suppressHydrationWarning>
      <body
        className="
          dark motion-profile-luxurious min-h-dvh bg-background font-sans
          text-foreground antialiased
        "
      >
        <ServerError500Page
          action={
            <Button
              className="h-11 rounded-xl px-6"
              onClick={reset}
              size="lg"
              type="button"
            >
              <RotateCcw className="size-4" />
              Try again
            </Button>
          }
        />
      </body>
    </html>
  );
}
