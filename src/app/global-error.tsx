"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { StatusPage } from "@/app/app-components";
import { Button } from "@/components/ui/button";

/**
 * Global error boundary rendered for unrecoverable runtime errors.
 * Replaces the root layout, so it provides its own `<html>` and `<body>`.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        className="
          motion-profile-luxurious min-h-dvh bg-background font-sans
          text-foreground antialiased
        "
      >
        <StatusPage
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
          code="500"
          eyebrow="Something went wrong"
          icon={AlertTriangle}
          iconClassName="size-7 text-destructive"
          message="An unexpected error occurred. Please try again, or return to the home page if the problem persists."
        />
      </body>
    </html>
  );
}
