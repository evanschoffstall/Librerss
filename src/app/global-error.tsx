"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { StatusPage } from "@/app/app-components";
import { Button } from "@/components/ui/button";

/**
 * Describes the props for the global error component.
 */
interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Render the global error component.
 * @param props - The component props.
 * @returns The rendered global error component.
 */
export default function GlobalError(props: GlobalErrorProps) {
  const { reset } = props;
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
